import {
  customerDocuments,
  customers,
  type DbClient,
} from "@ugo/db";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import type { AudioStorageConfig } from "../../routes/audio.js";

/**
 * L'oblio di un cliente (ADR-093).
 *
 * ADR-052 diceva «l'oblio è il cascade da `customers`», e le FK ci sono
 * tutte: repos, documenti, caselle, chunks, cache delle risposte, token,
 * ticket, messaggi, ricompense, assegnazioni. Ma la frase aveva due buchi,
 * scoperti scrivendo il runbook: **non esisteva la rotta** — una richiesta
 * GDPR si evadeva a mano sul database — e **il cascade non tocca il bucket**:
 * i PDF del cliente restavano nell'object storage, orfani e integri, che per
 * una cancellazione è il fallimento peggiore possibile perché non lo vede
 * nessuno.
 *
 * L'ordine qui dentro è una decisione, non un caso:
 *
 * 1. **prima il bucket, poi il database.** Se il bucket fallisce ci si ferma
 *    con le righe intatte e si riprova — le chiavi sono ancora lì. Se il
 *    database fallisse dopo il bucket, le righe restano e il forget si
 *    riesegue: cancellare un oggetto già cancellato è un no-op, quindi
 *    l'intera operazione è **riprovabile** da qualunque punto muoia.
 *    L'ordine inverso — database prima — avrebbe lasciato oggetti orfani
 *    senza più nessuna riga che ne ricordi la chiave.
 * 2. **niente redazione, solo cascade.** Un cliente non è un `being`: i suoi
 *    testi vivono nelle sue tabelle, non sparsi nella biografia di UGO. La
 *    cancellazione è il DELETE con le sue FK, e ciò che il cascade non copre
 *    (il bucket) si copre qui.
 */

export interface ForgetCustomerReport {
  /** i documenti trovati nel database prima di cancellare */
  documentsFound: number;
  /** gli oggetti effettivamente tolti dal bucket */
  objectsDeleted: number;
  /** true se la riga del cliente è stata cancellata (cascade compreso) */
  erased: boolean;
}

export class CustomerNotFoundError extends Error {
  public constructor(customerId: string) {
    super(`customer ${customerId} not found`);
  }
}

export async function forgetCustomer(
  db: DbClient,
  customerId: string,
  accountId: string,
  storage?: AudioStorageConfig,
): Promise<ForgetCustomerReport> {
  const [found] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)));
  if (found === undefined) throw new CustomerNotFoundError(customerId);

  // le chiavi si leggono PRIMA di cancellare: dopo, nessuno le ricorda più
  const documents = await db
    .select({ key: customerDocuments.s3Key })
    .from(customerDocuments)
    .where(
      and(
        eq(customerDocuments.customerId, customerId),
        eq(customerDocuments.accountId, accountId),
      ),
    );

  /**
   * Documenti nel database e nessun bucket configurato: ci si FERMA. Cancellare
   * le righe adesso lascerebbe gli oggetti orfani per sempre — nessuna riga ne
   * ricorderebbe più la chiave — che è esattamente il buco che questa funzione
   * esiste per chiudere. Un oblio a metà che si dichiara riuscito è peggio di
   * un rifiuto con la ragione scritta.
   */
  if (documents.length > 0 && storage === undefined) {
    throw new Error(
      `il cliente ha ${String(documents.length)} documenti nel bucket e il bucket non è configurato: impossibile cancellare tutto, quindi non si cancella niente`,
    );
  }

  let objectsDeleted = 0;
  if (documents.length > 0 && storage !== undefined) {
    const client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
      forcePathStyle: true,
    });
    for (const document of documents) {
      // DeleteObject è idempotente: una chiave già sparita risponde 204, e
      // questo è ciò che rende il forget riprovabile
      await client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: document.key }));
      objectsDeleted += 1;
    }
  }

  const erased = await db
    .delete(customers)
    .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)))
    .returning({ id: customers.id });

  return { documentsFound: documents.length, objectsDeleted, erased: erased.length > 0 };
}
