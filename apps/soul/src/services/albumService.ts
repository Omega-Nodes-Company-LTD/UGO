import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  accounts,
  beings,
  photos,
  withAccount,
  type DbClient,
} from "@ugo/db";
import { decryptBytes, encryptBytes, unwrapDataKey } from "@ugo/shared";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { AudioStorageConfig } from "../routes/audio.js";

/**
 * L'album di famiglia (ADR-109).
 *
 * Tre promesse, e questo file è dove diventano vere:
 *
 * 1. **Si scatta solo su gesto**, mai da soli. `AlbumService.keep()` è
 *    l'unico punto che scrive una foto, e `albumGate.test.ts` lo tiene vero
 *    leggendo i sorgenti (la famiglia di guardie di ADR-091/099).
 * 2. **`no_vision` vale a monte**: se anche una sola persona del branco ha
 *    detto «non guardarmi», per questa casa l'album tace. Il controllo sta
 *    PRIMA di chiedere il frame al corpo — non dopo averlo ricevuto: una
 *    foto scartata a valle è una foto che è comunque esistita (regola 9,
 *    ADR-016 §5).
 * 3. **I pixel sono ciphertext** con la DEK della casa, in un bucket privato:
 *    distruggere la chiave cancella l'album insieme al resto (ADR-019 §2), e
 *    la riservatezza non dipende da come è configurato l'object storage.
 *
 * **Ogni query nomina la casa**, oltre a girare dentro `withAccount`. Non è
 * ridondanza: RLS non si applica al proprietario delle tabelle, e da lì
 * passano i job, le migrazioni e i test. Un `drop()` che si fidava solo del
 * muro cancellava la foto della casa accanto — l'ha scoperto il test
 * d'integrazione, che è connesso proprio come loro.
 */

export type KeepPhotoRefusal =
  | "album-spento"
  | "qualcuno-non-vuole"
  | "niente-archivio"
  | "esemplare-sconosciuto";

export interface StoredPhoto {
  id: string;
  caption: string;
  takenAt: Date;
  expiresAt: Date;
}

export interface AlbumServiceDeps {
  db: DbClient;
  /** la KEK di processo: avvolge le DEK delle case (ADR-019) */
  masterKey: Buffer;
  /** il bucket delle foto; assente = l'album non può esistere, e lo dice */
  storage?: AudioStorageConfig | undefined;
}

export class AlbumService {
  public constructor(private readonly deps: AlbumServiceDeps) {}

  private client(storage: AudioStorageConfig): S3Client {
    return new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
      forcePathStyle: true,
    });
  }

  /** La chiave della casa, o quella di processo per chi non ne ha una. */
  private async houseKey(accountId: string): Promise<Buffer> {
    const [row] = await this.deps.db
      .select({ wrapped: accounts.wrappedDataKey })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (row?.wrapped == null) return this.deps.masterKey;
    try {
      return unwrapDataKey(row.wrapped, this.deps.masterKey);
    } catch {
      return this.deps.masterKey;
    }
  }

  /**
   * Per quante ore questa casa tiene le foto, e chi eventualmente non vuole
   * essere guardato. Una domanda sola perché sono i due cancelli dello
   * scatto, e chiederli separati è il modo in cui uno dei due si dimentica.
   */
  public async gate(
    accountId: string,
  ): Promise<{ hours: number; someoneRefuses: boolean }> {
    const [row] = await this.deps.db
      .select({ hours: accounts.photoRetentionHours })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    const [refuser] = await this.deps.db
      .select({ id: beings.id })
      .from(beings)
      .where(and(eq(beings.accountId, accountId), eq(beings.noVision, true)))
      .limit(1);
    return { hours: row?.hours ?? 0, someoneRefuses: refuser !== undefined };
  }

  /**
   * La durata scelta dal titolare. Non ricalcola le scadenze già scritte:
   * allungare non resuscita una foto che stava per sparire, e accorciare
   * vale dal prossimo scatto — la scadenza di una foto è una promessa fatta
   * quando è stata scattata.
   */
  public async setRetention(accountId: string, hours: number): Promise<void> {
    await withAccount(this.deps.db, accountId, (tx) =>
      tx
        .update(accounts)
        .set({ photoRetentionHours: hours })
        .where(eq(accounts.id, accountId)),
    );
  }

  /**
   * Conserva uno scatto. **L'unico punto che scrive una foto.**
   *
   * I due cancelli si guardano PRIMA di toccare i pixel, e in questo ordine:
   * se la casa non tiene le foto non c'è niente da decidere, e se qualcuno
   * non vuole essere guardato non c'è niente da conservare.
   */
  public async keep(
    accountId: string,
    input: { gosinoId: string; jpegBase64: string; caption: string; at?: Date },
  ): Promise<StoredPhoto | KeepPhotoRefusal> {
    const { hours, someoneRefuses } = await this.gate(accountId);
    if (hours === 0) return "album-spento";
    if (someoneRefuses) return "qualcuno-non-vuole";
    const storage = this.deps.storage;
    if (storage === undefined) return "niente-archivio";

    const at = input.at ?? new Date();
    const expiresAt = new Date(at.getTime() + hours * 3600_000);
    const key = `album/${accountId}/${randomUUID()}`;
    const sealed = encryptBytes(Buffer.from(input.jpegBase64, "base64"), await this.houseKey(accountId));
    // prima il bucket, poi la riga: una riga che punta a un oggetto assente è
    // una foto rotta, un oggetto senza riga è spazzatura che la scadenza non
    // trova — ma la scadenza legge le righe, quindi l'ordine giusto è questo
    // solo perché il fallimento della riga lascia un orfano, non un buco
    await this.client(storage).send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        Body: sealed,
        // opaco di proposito: il tipo vero direbbe «qui c'è una foto» a
        // chiunque elenchi il bucket, e quello che c'è è ciphertext
        ContentType: "application/octet-stream",
      }),
    );

    const written = await withAccount(this.deps.db, accountId, async (tx) => {
      const [row] = await tx
        .insert(photos)
        .values({
          accountId,
          gosinoId: input.gosinoId,
          objectKey: key,
          caption: input.caption.trim(),
          takenAt: at,
          expiresAt,
        })
        .returning({ id: photos.id });
      return row;
    });
    if (written === undefined) return "esemplare-sconosciuto";
    return { id: written.id, caption: input.caption.trim(), takenAt: at, expiresAt };
  }

  /** L'album, dal più recente. Le scadute non ci sono più per definizione. */
  public async list(accountId: string, limit = 60): Promise<StoredPhoto[]> {
    const rows = await withAccount(this.deps.db, accountId, (tx) =>
      tx
        .select({
          id: photos.id,
          caption: photos.caption,
          takenAt: photos.takenAt,
          expiresAt: photos.expiresAt,
        })
        .from(photos)
        .where(eq(photos.accountId, accountId))
        .orderBy(desc(photos.takenAt))
        .limit(limit),
    );
    return rows;
  }

  /**
   * Gli scatti che rispondono a «fammi vedere quelli del parco di stamattina»:
   * una parola nella didascalia, una finestra di tempo, o tutte e due.
   */
  public async search(
    accountId: string,
    query: { words?: string | undefined; since?: Date | undefined; until?: Date | undefined },
    limit = 6,
  ): Promise<StoredPhoto[]> {
    const words = query.words?.trim() ?? "";
    return withAccount(this.deps.db, accountId, (tx) =>
      tx
        .select({
          id: photos.id,
          caption: photos.caption,
          takenAt: photos.takenAt,
          expiresAt: photos.expiresAt,
        })
        .from(photos)
        .where(
          and(
            eq(photos.accountId, accountId),
            words === ""
              ? undefined
              : sql`${photos.caption} ilike ${"%" + words.replace(/[%_]/gu, "") + "%"}`,
            query.since === undefined ? undefined : gte(photos.takenAt, query.since),
            query.until === undefined ? undefined : lt(photos.takenAt, query.until),
          ),
        )
        .orderBy(desc(photos.takenAt))
        .limit(limit),
    );
  }

  /** I pixel, in chiaro, per chi ha il diritto di guardarli. */
  public async open(accountId: string, photoId: string): Promise<string | undefined> {
    const storage = this.deps.storage;
    if (storage === undefined) return undefined;
    const [row] = await withAccount(this.deps.db, accountId, (tx) =>
      tx
        .select({ key: photos.objectKey })
        .from(photos)
        .where(and(eq(photos.accountId, accountId), eq(photos.id, photoId))),
    );
    if (row === undefined) return undefined;
    try {
      const object = await this.client(storage).send(
        new GetObjectCommand({ Bucket: storage.bucket, Key: row.key }),
      );
      if (object.Body === undefined) return undefined;
      const sealed = Buffer.from(await object.Body.transformToByteArray());
      return decryptBytes(sealed, await this.houseKey(accountId)).toString("base64");
    } catch {
      return undefined;
    }
  }

  /**
   * La scadenza (ADR-109 §5), sul pattern delle impronte ignote: **prima il
   * bucket, poi il database**. `DeleteObject` è idempotente e le chiavi si
   * leggono solo dalle righe, quindi morire a metà lascia un lavoro
   * riprovabile — al contrario resterebbero oggetti che nessuno sa più di
   * avere (l'ordine di ADR-093).
   */
  public async expire(accountId: string, at: Date = new Date()): Promise<number> {
    const due = await withAccount(this.deps.db, accountId, (tx) =>
      tx
        .select({ id: photos.id, key: photos.objectKey })
        .from(photos)
        .where(and(eq(photos.accountId, accountId), lt(photos.expiresAt, at))),
    );
    if (due.length === 0) return 0;
    const storage = this.deps.storage;
    if (storage !== undefined) {
      const client = this.client(storage);
      for (const row of due) {
        await client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: row.key }));
      }
    }
    await withAccount(this.deps.db, accountId, (tx) =>
      tx.delete(photos).where(and(eq(photos.accountId, accountId), lt(photos.expiresAt, at))),
    );
    return due.length;
  }

  /** Una foto buttata a mano, senza aspettare la scadenza. Stesso ordine. */
  public async drop(accountId: string, photoId: string): Promise<boolean> {
    const [row] = await withAccount(this.deps.db, accountId, (tx) =>
      tx
        .select({ key: photos.objectKey })
        .from(photos)
        .where(and(eq(photos.accountId, accountId), eq(photos.id, photoId))),
    );
    if (row === undefined) return false;
    const storage = this.deps.storage;
    if (storage !== undefined) {
      await this.client(storage).send(
        new DeleteObjectCommand({ Bucket: storage.bucket, Key: row.key }),
      );
    }
    await withAccount(this.deps.db, accountId, (tx) =>
      tx.delete(photos).where(and(eq(photos.accountId, accountId), eq(photos.id, photoId))),
    );
    return true;
  }
}

/** Il rifiuto, detto come va detto: quattro ragioni, quattro frasi. */
export const KEEP_REFUSALS: Readonly<Record<KeepPhotoRefusal, string>> = {
  "album-spento":
    "L'album è spento: questa casa non conserva foto. Si accende dal pannello, scegliendo per quanto tenerle.",
  "qualcuno-non-vuole":
    "Qui c'è chi ha chiesto di non essere guardato, e allora non conservo foto di questa casa. Grunf.",
  "niente-archivio": "Non ho un posto dove tenerla: l'archivio delle foto non è configurato.",
  "esemplare-sconosciuto": "Quell'esemplare non è di questa casa.",
};
