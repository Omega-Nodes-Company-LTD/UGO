import { randomBytes } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, photos, runMigrations } from "@ugo/db";
import { startMinio, startPostgres, type MinioHandle } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AudioStorageConfig } from "../../src/routes/audio.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { AlbumService } from "../../src/services/albumService.js";
import { Photographer } from "../../src/services/photographer.js";

/**
 * L'album di famiglia (ADR-109), il giro intero su Postgres **e MinIO veri**.
 *
 * I cancelli stanno in `albumGates.integration.test.ts`, che rifiuta prima di
 * arrivare al bucket e quindi gira ovunque. Qui c'è ciò che solo un archivio
 * vero può dimostrare, e sono le tre promesse che l'ADR fa al proprietario:
 *
 * 1. **i pixel nel bucket sono ciphertext** — chi elenca l'object storage non
 *    vede una foto, vede rumore, e non c'è nemmeno un `Content-Type` che dica
 *    di che si tratta;
 * 2. **la scadenza porta via il file, non solo la riga** — è l'errore che
 *    ADR-093 ha già pagato una volta sui documenti dei clienti: il cascade
 *    cancellava le righe e lasciava gli oggetti orfani e integri, cioè una
 *    casa che crede di aver dimenticato e invece no;
 * 3. **una casa non apre le foto dell'altra**, nemmeno conoscendone l'id.
 */

const MASTER_KEY = randomBytes(32);
const BUCKET = "ugo-photos-test";
/** un «jpeg» finto ma non banale: se uscisse in chiaro dal bucket si vedrebbe */
const PIXELS = randomBytes(512).toString("base64");

let pg: StartedPostgreSqlContainer;
let minio: MinioHandle;
let db: DbClient;
let s3: S3Client;
let storage: AudioStorageConfig;
let album: AlbumService;
let casa: { accountId: string; gosinoId: string };
let vicini: { accountId: string; gosinoId: string };
/** ciò che il corpo si è visto arrivare sullo schermo */
let onScreen: { id: string; caption: string; image: string }[];

/**
 * Le ore di questo test sono **locali**, non UTC, e di proposito: `windowFor`
 * disegna «stamattina» con `setHours`, cioè nel fuso di chi gira il test.
 * Ancorare gli scatti a orari locali di oggi rende il giro identico su
 * qualunque macchina; scriverli in UTC li renderebbe verdi qui e rossi in CI.
 */
const today = (hours: number, minutes = 0): Date => {
  const when = new Date();
  when.setHours(hours, minutes, 0, 0);
  return when;
};

/** L'unica riga che deve esserci: se manca, il test dice cosa mancava. */
const only = <T>(rows: T[], what: string): T => {
  const row = rows[0];
  if (row === undefined) throw new Error(`manca ${what}`);
  return row;
};

/** Un corpo finto con la camera: risponde subito, e ricorda cosa gli è arrivato. */
function body() {
  return {
    hasBody: () => true,
    askGlimpse: () => undefined,
    takeGlimpse: () => undefined,
    askPhoto: () => undefined,
    takePhoto: () => PIXELS,
    showPhotos: (shown: { id: string; caption: string; image: string }[]) => {
      onScreen = shown;
    },
  };
}

/** Il contenuto grezzo dell'oggetto, o `undefined` se nel bucket non c'è più. */
const rawObject = async (key: string): Promise<Buffer | undefined> => {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (object.Body === undefined) return undefined;
    return Buffer.from(await object.Body.transformToByteArray());
  } catch {
    return undefined;
  }
};

const rows = () =>
  db.select({ id: photos.id, key: photos.objectKey, accountId: photos.accountId }).from(photos);

beforeAll(async () => {
  const [started, startedMinio] = await Promise.all([startPostgres(), startMinio()]);
  pg = started.container;
  minio = startedMinio;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  storage = {
    endpoint: minio.endpoint,
    accessKey: minio.accessKey,
    secretKey: minio.secretKey,
    bucket: BUCKET,
    region: "us-east-1",
  };
  s3 = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
    forcePathStyle: true,
  });
  const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));

  casa = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-foto",
    name: "Casa Foto",
    gosinoName: "Ugo",
  });
  vicini = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "vicini-foto",
    name: "I Vicini",
    gosinoName: "Estraneo",
  });
  album = new AlbumService({ db, masterKey: MASTER_KEY, storage });
  // la casa accende l'album: sei ore, lo scalino più corto
  await album.setRetention(casa.accountId, 6);
  onScreen = [];
}, 300_000);

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), minio.container.stop()]);
});

const shoot = (caption: string, at: Date) =>
  new Photographer({
    gateway: body,
    album,
    accountId: casa.accountId,
    gosinoId: casa.gosinoId,
    vision: { describe: () => Promise.resolve(caption) },
    waitMs: 500,
    pollMs: 10,
  }).shoot(at);

describe("l'album di famiglia, con l'archivio vero", () => {
  it("scatta, e nel bucket non c'è una foto: c'è ciphertext", async () => {
    const at = today(9, 30);
    const shot = await shoot("il parco con gli alberi grandi", at);
    expect(shot.outcome).toBe("kept");
    if (shot.outcome !== "kept") return;
    expect(shot.caption).toBe("il parco con gli alberi grandi");
    // sei ore dopo LO SCATTO, non sei ore da adesso
    expect(shot.expiresAt.getTime()).toBe(at.getTime() + 6 * 3600_000);

    const row = only(await rows(), "la riga della foto");
    expect(row.accountId).toBe(casa.accountId);
    const stored = await rawObject(row.key);
    expect(stored).toBeDefined();
    // la prova che conta: l'oggetto NON è i pixel che sono entrati
    expect(stored?.equals(Buffer.from(PIXELS, "base64"))).toBe(false);
    expect(stored?.toString("base64")).not.toContain(PIXELS.slice(0, 40));
  });

  it("e riaperta dalla casa torna identica a com'era", async () => {
    const row = only(await rows(), "la riga della foto");
    expect(await album.open(casa.accountId, row.id)).toBe(PIXELS);
  });

  it("il vicino non la apre, nemmeno sapendone l'id", async () => {
    const row = only(await rows(), "la riga della foto");
    expect(await album.open(vicini.accountId, row.id)).toBeUndefined();
    // e non la butta: `drop` non trova niente da buttare
    expect(await album.drop(vicini.accountId, row.id)).toBe(false);
    expect(await rawObject(row.key)).toBeDefined();
    expect(
      await db.select({ id: photos.id }).from(photos).where(eq(photos.id, row.id)),
    ).toHaveLength(1);
  });

  it("«fammi vedere quelli del parco» le trova e le manda allo schermo", async () => {
    // un secondo scatto, di un'altra cosa e a un'altra ora
    await shoot("il tavolo della cucina", today(15));

    const shown = await new Photographer({
      gateway: body,
      album,
      accountId: casa.accountId,
      gosinoId: casa.gosinoId,
    }).show({ kind: "show", words: "parco", count: 2, when: "stamattina" }, today(21));
    expect(shown).toEqual({ outcome: "shown", count: 1 });
    expect(onScreen).toHaveLength(1);
    expect(onScreen[0]?.caption).toBe("il parco con gli alberi grandi");
    // sullo schermo arrivano i pixel in chiaro: è lo scopo dell'operazione
    expect(onScreen[0]?.image).toBe(PIXELS);
  });

  it("la scadenza porta via il FILE prima della riga, e solo le scadute", async () => {
    const before = await rows();
    expect(before).toHaveLength(2);

    // le 16:00: la prima (9:30 + 6h = 15:30) è scaduta, la seconda (15:00 +
    // 6h = 21:00) no. Le durate sono promesse fatte allo scatto, una per una
    expect(await album.expire(casa.accountId, today(16))).toBe(1);

    const left = await rows();
    expect(left).toHaveLength(1);
    const survivor = only(left, "la foto ancora buona");
    const gone = only(
      before.filter((photo) => photo.id !== survivor.id),
      "la foto scaduta",
    );
    // il punto dell'ADR: l'oggetto è sparito DAVVERO, non solo la riga
    expect(await rawObject(gone.key)).toBeUndefined();
    // e quella ancora buona è intatta, pixel compresi
    expect(await rawObject(survivor.key)).toBeDefined();
    expect(await album.open(casa.accountId, survivor.id)).toBe(PIXELS);
  });

  it("buttarne una a mano fa la stessa cosa, subito", async () => {
    const row = only(await rows(), "la foto da buttare");
    expect(await album.drop(casa.accountId, row.id)).toBe(true);
    expect(await rawObject(row.key)).toBeUndefined();
    expect(await rows()).toHaveLength(0);
  });

  it("una casa che non tiene le foto non lascia niente nel bucket", async () => {
    const shot = await new Photographer({
      gateway: body,
      album,
      accountId: vicini.accountId,
      gosinoId: vicini.gosinoId,
      vision: { describe: () => Promise.resolve("qualcosa") },
      waitMs: 500,
      pollMs: 10,
    }).shoot(today(10));
    expect(shot).toEqual({ outcome: "refused", why: "album-spento" });
    expect(await rows()).toHaveLength(0);
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `album/${vicini.accountId}/` }),
    );
    expect(listed.Contents ?? []).toHaveLength(0);
  });
});
