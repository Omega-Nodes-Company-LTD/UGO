import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  beings,
  createDbClient,
  type DbClient,
  photos,
  runMigrations,
  withAccount,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AlbumService } from "../../src/services/albumService.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { Photographer } from "../../src/services/photographer.js";

/**
 * ADR-109, i due cancelli e il muro — la parte che non ha bisogno di un
 * bucket, perché **rifiuta prima di arrivarci**.
 *
 * È il file che prova la regola 9: `no_vision` si applica a monte, e la
 * prova è che al corpo non venga chiesto niente. Il giro completo con
 * l'archivio vero sta in `album.integration.test.ts` e gira in CI, dove
 * MinIO c'è.
 */

const MASTER_KEY = randomBytes(32);
const APP_PASSWORD = "ugo-app-test-password";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: DbClient;
let casa: { accountId: string; gosinoId: string };
let vicini: { accountId: string; gosinoId: string };
let album: AlbumService;
/** quante volte al corpo è stato chiesto uno scatto */
let shotsAsked: number;

function body() {
  return {
    hasBody: () => true,
    askGlimpse: () => undefined,
    takeGlimpse: () => undefined,
    askPhoto: () => {
      shotsAsked += 1;
    },
    takePhoto: () => "ZmludGktcGl4ZWw=",
    showPhotos: () => undefined,
  };
}

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  await db.execute(sql.raw(`ALTER ROLE ugo_app LOGIN PASSWORD '${APP_PASSWORD}'`));
  const appUrl = new URL(started.url);
  appUrl.username = "ugo_app";
  appUrl.password = APP_PASSWORD;
  app = createDbClient(appUrl.toString());

  casa = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-album",
    name: "Casa Album",
    gosinoName: "Ugo",
  });
  vicini = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-vicini-album",
    name: "I Vicini",
    gosinoName: "Estraneo",
  });
  album = new AlbumService({ db, masterKey: MASTER_KEY });
  shotsAsked = 0;
}, 240_000);

afterAll(async () => {
  await app.$client.end();
  await db.$client.end();
  await pg.stop();
});

const shoot = () =>
  new Photographer({
    gateway: () => body(),
    album,
    accountId: casa.accountId,
    gosinoId: casa.gosinoId,
    waitMs: 200,
    pollMs: 10,
  }).shoot();

describe("il primo cancello: l'album nasce spento", () => {
  it("una casa nuova non conserva niente, e lo dice", async () => {
    const [row] = await db
      .select({ hours: accounts.photoRetentionHours })
      .from(accounts)
      .where(eq(accounts.id, casa.accountId));
    expect(row?.hours).toBe(0);

    const shot = await shoot();
    expect(shot).toEqual({ outcome: "refused", why: "album-spento" });
    // e al corpo non è stato chiesto niente: il cancello sta prima dei pixel
    expect(shotsAsked).toBe(0);
  });

  it("il database rifiuta una durata che non è uno degli scalini", async () => {
    await expect(
      db.execute(
        sql`update accounts set photo_retention_hours = 5 where id = ${casa.accountId}`,
      ),
    ).rejects.toThrow();
    await album.setRetention(casa.accountId, 24);
    const gate = await album.gate(casa.accountId);
    expect(gate.hours).toBe(24);
  });
});

describe("il secondo cancello: «non guardarmi» spegne l'album (regola 9)", () => {
  it("basta una persona del branco, e al corpo non si chiede niente", async () => {
    await db.insert(beings).values({
      accountId: casa.accountId,
      displayName: "Chi non vuole",
      noVision: true,
    });
    shotsAsked = 0;

    const shot = await shoot();
    expect(shot).toEqual({ outcome: "refused", why: "qualcuno-non-vuole" });
    // **la prova della regola 9**: la foto non è stata scattata, non è stata
    // scartata dopo. Verificato rosso spostando il cancello dopo `askPhoto`
    expect(shotsAsked).toBe(0);

    const kept = await db.select().from(photos).where(eq(photos.accountId, casa.accountId));
    expect(kept).toHaveLength(0);
  });

  it("tolto il flag, il cancello si riapre", async () => {
    await db
      .update(beings)
      .set({ noVision: false })
      .where(eq(beings.accountId, casa.accountId));
    const gate = await album.gate(casa.accountId);
    expect(gate.someoneRefuses).toBe(false);
    expect(gate.hours).toBe(24);
  });
});

describe("il muro: l'album è di una casa sola", () => {
  it("il vicino non vede le foto, nemmeno con l'id in mano", async () => {
    const [mine] = await withAccount(db, casa.accountId, (tx) =>
      tx
        .insert(photos)
        .values({
          accountId: casa.accountId,
          gosinoId: casa.gosinoId,
          objectKey: "album/finta",
          caption: "il parco",
          expiresAt: new Date(Date.now() + 3600_000),
        })
        .returning({ id: photos.id }),
    );
    if (mine === undefined) throw new Error("nessuna foto");

    const theirs = await withAccount(app, vicini.accountId, (tx) =>
      tx.execute(sql`select id from photos where id = ${mine.id}`),
    );
    expect(theirs).toHaveLength(0);

    const ours = await withAccount(app, casa.accountId, (tx) =>
      tx.execute(sql`select id from photos where id = ${mine.id}`),
    );
    expect(ours).toHaveLength(1);
  });

  it("una foto non si modifica: si scatta, si guarda, scade", async () => {
    await expect(
      withAccount(app, casa.accountId, (tx) =>
        tx.update(photos).set({ caption: "un'altra cosa" }).where(eq(photos.accountId, casa.accountId)),
      ),
    ).rejects.toThrow();
  });

  it("una foto che nasce già scaduta il database non la scrive", async () => {
    const past = new Date(Date.now() - 1000);
    await expect(
      withAccount(db, casa.accountId, (tx) =>
        tx.insert(photos).values({
          accountId: casa.accountId,
          gosinoId: casa.gosinoId,
          objectKey: "album/impossibile",
          takenAt: new Date(),
          expiresAt: past,
        }),
      ),
    ).rejects.toThrow();
  });

  it("la scadenza porta via le righe scadute, e solo quelle", async () => {
    await withAccount(db, casa.accountId, (tx) =>
      tx.insert(photos).values({
        accountId: casa.accountId,
        gosinoId: casa.gosinoId,
        objectKey: "album/vecchia",
        caption: "ieri",
        takenAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 3600_000),
      }),
    );
    const destroyed = await album.expire(casa.accountId);
    expect(destroyed).toBe(1);
    const left = await withAccount(db, casa.accountId, (tx) =>
      tx.select({ caption: photos.caption }).from(photos),
    );
    expect(left.map((row) => row.caption)).toEqual(["il parco"]);
  });
});
