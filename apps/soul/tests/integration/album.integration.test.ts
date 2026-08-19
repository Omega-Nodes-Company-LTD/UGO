import { randomBytes } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { accountTies, createDbClient, type DbClient, parcels, photos, runMigrations } from "@ugo/db";
import { startMinio, startPostgres, type MinioHandle } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AudioStorageConfig } from "../../src/routes/audio.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { AlbumService } from "../../src/services/albumService.js";
import { ParcelService } from "../../src/services/parcelService.js";
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
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch {
    // già nostro: succede quando l'archivio non è un container usa-e-getta
    // ma un MinIO acceso a parte (`UGO_TEST_S3_URL`). Il bucket è comunque
    // solo di questo file, ed è ciò che serve
  }

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

/**
 * ADR-109 × ADR-099: la cartolina che porta una foto.
 *
 * La regola che questo blocco esiste per dimostrare è una sola, e non si vede
 * da nessuna parte se non qui: **la durata che vale è quella di chi riceve**.
 * Una cartolina è di chi la riceve, e quanto si tengono le cose lo decide la
 * casa che le ospita — non quella che le manda.
 */
describe("la cartolina con la foto", () => {
  const post = () => new ParcelService(db, MASTER_KEY, album);

  const tieBetween = async (): Promise<string> => {
    const [tie] = await db
      .insert(accountTies)
      .values({
        fromAccountId: casa.accountId,
        toAccountId: vicini.accountId,
        label: "i vicini",
        status: "accettata",
        acceptedAt: new Date(),
      })
      .returning({ id: accountTies.id });
    if (tie === undefined) throw new Error("la parentela non è stata scritta");
    return tie.id;
  };

  it("non parte se l'album di CHI RICEVE è spento — né la foto né le parole", async () => {
    await album.setRetention(casa.accountId, 6);
    await album.setRetention(vicini.accountId, 0);
    const tieId = await tieBetween();
    const mine = await shoot("il parco", today(9));
    expect(mine.outcome).toBe("kept");
    if (mine.outcome !== "kept") return;

    const sent = await post().send(casa.accountId, {
      tieId,
      fromGosinoId: casa.gosinoId,
      kind: "messaggio",
      text: "guardate qui",
      photoId: mine.photoId,
    });
    expect(sent).toBe("album-loro-spento");
    // e la cartolina non esiste a metà: non è stata scritta affatto
    expect(await db.select().from(parcels)).toHaveLength(0);
  });

  it("con il loro album acceso arriva, e con la LORO durata — non la nostra", async () => {
    // noi teniamo le foto sei ore, loro tre giorni: la copia che ricevono
    // deve vivere settantadue ore, non sei
    await album.setRetention(casa.accountId, 6);
    await album.setRetention(vicini.accountId, 72);
    const [tie] = await db.select({ id: accountTies.id }).from(accountTies);
    if (tie === undefined) throw new Error("manca la parentela");

    const before = await rows();
    const sent = await post().send(casa.accountId, {
      tieId: tie.id,
      fromGosinoId: casa.gosinoId,
      kind: "messaggio",
      text: "siamo al parco",
      photoId: only(before, "la nostra foto").id,
    });
    expect(typeof sent).not.toBe("string");

    const [parcel] = await db
      .select({ photoId: parcels.photoId, to: parcels.toAccountId })
      .from(parcels);
    expect(parcel?.photoId).not.toBeNull();
    expect(parcel?.to).toBe(vicini.accountId);

    const theirs = await album.list(vicini.accountId);
    expect(theirs).toHaveLength(1);
    const copy = only(theirs, "la copia nel loro album");
    // la provenienza è scritta nella didascalia: una foto arrivata da fuori
    // non deve sembrare scattata in casa
    expect(copy.caption).toContain("Cartolina da «Casa Foto»");
    expect(copy.caption).toContain("siamo al parco");
    // e la durata è la loro: settantadue ore, non le nostre sei
    const hours = (copy.expiresAt.getTime() - copy.takenAt.getTime()) / 3600_000;
    expect(Math.round(hours)).toBe(72);

    // i pixel sono gli stessi, ma l'oggetto no: è ri-cifrato con la LORO
    // chiave, ed è ciò che rende la copia davvero loro
    expect(await album.open(vicini.accountId, copy.id)).toBe(PIXELS);
    expect(await album.open(casa.accountId, copy.id)).toBeUndefined();
  });

  it("e quando la loro foto scade, la cartolina resta: il testo non muore con l'immagine", async () => {
    const copy = only(await album.list(vicini.accountId), "la copia");
    expect(await album.expire(vicini.accountId, new Date(copy.expiresAt.getTime() + 1000))).toBe(1);
    const [parcel] = await db.select({ photoId: parcels.photoId }).from(parcels);
    // `ON DELETE SET NULL (photo_id)`: senza, la scadenza si sarebbe bloccata
    // da sola sulla chiave esterna, e la durata promessa sarebbe stata falsa
    expect(parcel?.photoId).toBeNull();
    expect(await db.select().from(parcels)).toHaveLength(1);
  });
});
