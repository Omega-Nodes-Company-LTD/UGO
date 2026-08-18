import {
  bonds,
  births,
  checkins,
  customerGosini,
  feedings,
  desires,
  diaryEntries,
  events,
  gosini,
  memories,
  messages,
  traitSets,
  type DbClient,
} from "@ugo/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * La cessione (ADR-082): un nato cambia casa.
 *
 * Due domande, e la seconda è quella difficile. La prima — **chi si può
 * cedere** — l'ha già risposta ADR-081: solo i `nato`, mai un capostipite.
 * La seconda è **cosa parte con lui**.
 *
 * Parte la creatura: il genoma, l'identità crittografica, l'arco della vita,
 * la genealogia. **Non parte la vita vissuta in allevamento** — ricordi,
 * conversazioni, diario, desideri, legami — e non per prudenza: quelle sono
 * parole di persone che stanno a casa di qualcun altro, e venderle con
 * l'animale sarebbe una fuga di dati con la fattura. Chi vuole passare anche
 * il sapere ha lo strumento apposta, ed è curato: la **dote** (ADR-074).
 *
 * Il gosino arriva quindi con il suo carattere e la testa vuota. È come si
 * prende un cucciolo.
 */

export type TransferRefusal =
  | "non-esiste"
  | "non-cedibile"
  | "stessa-casa"
  | "se-n-e-andato"
  | "ha-clienti";

export interface TransferResult {
  gosinoId: string;
  name: string;
  /** quante righe di vita sono rimaste in allevamento invece di viaggiare */
  leftBehind: number;
}

export class TransferService {
  public constructor(private readonly db: DbClient) {}

  /**
   * Cede `gosinoId` da `fromAccountId` a `toAccountId`.
   *
   * Oggi vale **dentro la stessa installazione**: dal nostro allevamento a una
   * famiglia che ospitiamo noi. Verso un'altra installazione servirà un
   * archivio sigillato come quello della dote, e non è questo servizio.
   */
  public async cede(
    fromAccountId: string,
    gosinoId: string,
    toAccountId: string,
  ): Promise<TransferResult | TransferRefusal> {
    if (fromAccountId === toAccountId) return "stessa-casa";

    const [creature] = await this.db
      .select({
        id: gosini.id,
        name: gosini.name,
        origin: gosini.origin,
        gone: gosini.retiredAt,
      })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.accountId, fromAccountId)));
    if (creature === undefined) return "non-esiste";
    if (creature.gone !== null) return "se-n-e-andato";
    // ADR-081: si cedono solo i nati. Un capostipite è l'inizio di una stirpe,
    // e una stirpe non si vende — si vendono i figli
    if (creature.origin !== "nato") return "non-cedibile";

    /**
     * Un gosino da lavoro non si consegna a una famiglia: ha clienti assegnati
     * e ticket aperti, e trascinarli in casa di qualcun altro sarebbe portare i
     * clienti di uno studio dentro un salotto. Prima si sciolgono i rapporti.
     */
    const employed = await this.db
      .select({ id: customerGosini.customerId })
      .from(customerGosini)
      .where(eq(customerGosini.gosinoId, gosinoId))
      .limit(1);
    if (employed.length > 0) return "ha-clienti";

    return this.db.transaction(async (tx) => {
      /**
       * I vincoli compositi (ADR-048: ogni riga vive nella casa dei suoi capi)
       * si differiscono per la durata di questa transazione. In mezzo a una
       * cessione, per un istante, la coppia (casa, gosino) non torna — e
       * quell'istante non è un errore, è il passaggio.
       */
      await tx.execute(sql`set constraints all deferred`);
      /**
       * Quello che resta in allevamento. Si conta prima di cancellarlo, perché
       * chi cede ha diritto di sapere quanta vita è rimasta a casa sua — e chi
       * compra ha diritto di sapere che non gli arriva la vita di nessun altro.
       */
      let leftBehind = 0;
      // `checkins` è qui per la stessa ragione degli altri, e vale la pena
      // dirla: una domanda che torna è un'istruzione di **chi cede** — «ogni
      // sera chiedimi com'è andata» detto da un allevatore. Farla arrivare a
      // casa nuova vorrebbe dire una creatura che, la prima sera, chiede a
      // uno sconosciuto una cosa che non gli ha mai chiesto (ADR-085).
      for (const table of [memories, messages, diaryEntries, desires, events, checkins] as const) {
        const wiped = await tx
          .delete(table)
          .where(eq(table.gosinoId, gosinoId))
          .returning({ id: table.id });
        leftBehind += wiped.length;
      }
      /**
       * I legami sono di chi li ha vissuti: le persone dell'allevamento
       * restano dell'allevamento. `relations` non si tocca — è un grafo fra
       * **persone**, non fra la creatura e loro, e non era mai stato suo.
       */
      await tx.delete(bonds).where(eq(bonds.gosinoId, gosinoId));

      // la creatura, il suo genoma, la sua genealogia e i suoi pasti cambiano
      // casa. La stanza e il dispositivo no: erano di una casa che non è più
      // la sua
      await tx
        .update(gosini)
        .set({ accountId: toAccountId, locationLabel: null, deviceId: null })
        .where(eq(gosini.id, gosinoId));
      await tx
        .update(traitSets)
        .set({ accountId: toAccountId })
        .where(eq(traitSets.gosinoId, gosinoId));
      // le righe di nascita di LUI: senza, chi compra non vedrebbe da chi
      // discende quello che ha comprato
      await tx
        .update(births)
        .set({ accountId: toAccountId })
        .where(eq(births.childGosinoId, gosinoId));
      /**
       * I pasti sono **i suoi**: quello che ha mangiato se lo porta in pancia.
       * Lasciarli all'allevamento vorrebbe dire righe che parlano di una
       * creatura che non abita più lì — e il vincolo composito lo direbbe
       * subito, il che è il modo in cui il database ha ragione prima di noi.
       */
      await tx
        .update(feedings)
        .set({ accountId: toAccountId })
        .where(eq(feedings.gosinoId, gosinoId));

      return { gosinoId, name: creature.name, leftBehind };
    });
  }
}
