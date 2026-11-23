import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { auditLog, createDbClient, type DbClient, gosini, memories, messages, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText, EMBEDDING_DIMENSIONS, loadSpeciesMap, openSoulArchive } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { exportSoulArchive } from "../../src/services/soulExport/exportSoul.js";
import { issueToken } from "../../src/services/tenantAuth.js";

/**
 * «A casa tua», la rotta (ADR-132, MKT-10.4), sul giro vero: HTTP, token,
 * database e cifratura veri. Ciò che si prova qui non è l'archivio (lo prova
 * `soulExport.integration.test.ts`) ma la porta: chi può chiederlo, cosa si
 * rifiuta prima di scrivere un byte, e che la frase di recupero esca una volta
 * sola e mai nel giornale.
 */

const MASTER = randomBytes(32);
const KDF = { log2N: 10, r: 8, p: 1 } as const;
const RECOVERY_CODE = /^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/u;

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let on: FastifyInstance;
let off: FastifyInstance;
let ownerToken: string;
let memberToken: string;
let neighbourToken: string;
let houseId: string;
let creatureId: string;
let neighbourCreatureId: string;

const post = (token: string | undefined, body: unknown, app = on) =>
  app.inject({
    method: "POST",
    url: "/v1/privacy/soul-export",
    headers: { ...(token === undefined ? {} : { authorization: `Bearer ${token}` }), "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

async function open(payload: Buffer, secret: string): Promise<string> {
  const archive = await openSoulArchive(
    (async function* () {
      await Promise.resolve();
      yield payload;
    })(),
    secret,
  );
  const parts: string[] = [];
  for await (const table of archive.tables) {
    for await (const piece of table.data) parts.push(piece.toString("utf8"));
  }
  return parts.join("");
}

function server(withExport: boolean): FastifyInstance {
  return buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: { dataKey: MASTER },
      speciesMap: loadSpeciesMap(undefined),
      ...(withExport && {
        soulExport: (request, sink) =>
          exportSoulArchive(
            db,
            { masterKey: MASTER, generatorVersion: "test", embeddingModel: "openai/text-embedding-3-small", embeddingDimensions: EMBEDDING_DIMENSIONS, kdf: KDF },
            request,
            sink,
          ),
      }),
    },
  });
}

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const mine = await createAccountWithFounder(db, MASTER, { slug: "casa-mia", name: "Mia", gosinoName: "Ugo Mio" });
  const theirs = await createAccountWithFounder(db, MASTER, { slug: "casa-loro", name: "Loro", gosinoName: "Altro" });
  ownerToken = mine.ownerToken;
  neighbourToken = theirs.ownerToken;
  houseId = mine.accountId;
  creatureId = mine.gosinoId;
  neighbourCreatureId = theirs.gosinoId;
  memberToken = (await issueToken(db, { accountId: houseId, role: "member", label: "ospite" })).token;

  await db.insert(memories).values({ gosinoId: creatureId, kind: "fact", text: "Il corriere passa il martedì", importance: 0.8 });
  await db.insert(messages).values({ gosinoId: creatureId, channel: "home", role: "user", text: encryptText("ciao Ugo, sono Monika", MASTER) });

  on = server(true);
  off = server(false);
  await Promise.all([on.ready(), off.ready()]);
}, 240_000);

afterAll(async () => {
  await Promise.all([on.close(), off.close()]);
  await db.$client.end();
  await pg.stop();
});

describe("spenta, non esiste", () => {
  it("senza UGO_SOUL_EXPORT le rotte non sono registrate", async () => {
    expect((await post(ownerToken, { gosinoId: creatureId, confirmName: "Ugo Mio" }, off)).statusCode).toBe(404);
    const options = await off.inject({ method: "GET", url: "/v1/privacy/soul-export/options", headers: { authorization: `Bearer ${ownerToken}` } });
    expect(options.statusCode).toBe(404);
  });
});

describe("chi può chiederla", () => {
  it("nessun token: 401. Un token che non amministra: 403", async () => {
    expect((await post(undefined, { gosinoId: creatureId, confirmName: "Ugo Mio" })).statusCode).toBe(401);
    expect((await post(memberToken, { gosinoId: creatureId, confirmName: "Ugo Mio" })).statusCode).toBe(403);
  });

  // Il muso non ha un contratto per sapere se la funzione è accesa: lo deduce da
  // questi tre stati (apps/face/src/soulExportPanel.ts, optionsVerdict). Se uno
  // cambia qui, il muso sbaglia in silenzio: i due lati restano verdi da soli.
  it("lo stato delle opzioni è ciò che il muso legge: 404 spenta, 401/403 accesa ma senza chiave, 200 con", async () => {
    const options = (token?: string, app = on) =>
      app.inject({ method: "GET", url: "/v1/privacy/soul-export/options", headers: token === undefined ? {} : { authorization: `Bearer ${token}` } });
    expect((await options(undefined)).statusCode).toBe(401);
    expect((await options(memberToken)).statusCode).toBe(403);
    expect((await options(ownerToken)).statusCode).toBe(200);
    expect((await options(ownerToken, off)).statusCode).toBe(404);
    expect((await options(memberToken, off)).statusCode).toBe(404); // spenta è spenta per tutti
  });

  it("le opzioni elencano le creature vive della propria casa, e solo quelle", async () => {
    const response = await on.inject({ method: "GET", url: "/v1/privacy/soul-export/options", headers: { authorization: `Bearer ${ownerToken}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ creatures: { id: string; name: string }[] }>();
    expect(body.creatures.map((c) => c.id)).toEqual([creatureId]);
    expect(JSON.stringify(body)).not.toContain(neighbourCreatureId);
  });

  it("una creatura del vicino risponde come una che non esiste: 404, e il vicino non lo scopre", async () => {
    const response = await post(ownerToken, { gosinoId: neighbourCreatureId, confirmName: "Altro" });
    expect(response.statusCode).toBe(404);
    expect(response.rawPayload.length).toBeLessThan(400);
    const other = await post(ownerToken, { gosinoId: "11111111-2222-4333-8444-555555555555", confirmName: "x" });
    expect(other.statusCode).toBe(404);
  });
});

describe("si rifiuta prima di scrivere un byte", () => {
  it("senza il nome giusto: 422, e niente archivio", async () => {
    const response = await post(ownerToken, { gosinoId: creatureId, confirmName: "Ugh" });
    expect(response.statusCode).toBe(422);
    expect(response.headers["x-ugo-recovery-code"]).toBeUndefined();
    expect(response.headers["content-type"]).toContain("application/problem+json");
  });

  it("un corpo malformato: 400", async () => {
    expect((await post(ownerToken, { gosinoId: "non-un-uuid", confirmName: "x" })).statusCode).toBe(400);
    expect((await post(ownerToken, { gosinoId: creatureId, confirmName: "Ugo Mio", passphrase: "corta" })).statusCode).toBe(400);
  });
});

describe("l'archivio", () => {
  it("esce con la frase di recupero nell'intestazione, e con quella si apre", async () => {
    const response = await post(ownerToken, { gosinoId: creatureId, confirmName: "  ugo   MIO " });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="ugo-mio-\d{4}-\d{2}-\d{2}\.ugosoul"$/u);
    expect(response.headers["cache-control"]).toBe("no-store");
    const code = String(response.headers["x-ugo-recovery-code"]);
    expect(code).toMatch(RECOVERY_CODE);

    const text = await open(response.rawPayload, code);
    expect(text).toContain("Il corriere passa il martedì");
    expect(text).toContain("ciao Ugo, sono Monika"); // decifrato
    expect(text).not.toContain("v1:");
  });

  it("con una frase scelta: niente codice nell'intestazione, e si apre con la frase", async () => {
    const response = await post(ownerToken, { gosinoId: creatureId, confirmName: "Ugo Mio", passphrase: "una frase lunga che ricordo bene" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-ugo-recovery-code"]).toBeUndefined();
    expect(await open(response.rawPayload, "una frase lunga che ricordo bene")).toContain("martedì");
  });

  it("non si apre con un altro codice", async () => {
    const response = await post(ownerToken, { gosinoId: creatureId, confirmName: "Ugo Mio" });
    await expect(open(response.rawPayload, "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ")).rejects.toMatchObject({ code: "authentication-failed" });
  });
});

async function freshHouse(slug: string, creatureName: string) {
  const house = await createAccountWithFounder(db, MASTER, { slug, name: slug, gosinoName: creatureName });
  return { token: house.ownerToken, creatureId: house.gosinoId };
}

describe("il giornale registra l'atto, mai la frase", () => {
  it("una riga per atto, con l'id della creatura, e nessun segreto in nessuna colonna", async () => {
    const house = await freshHouse("casa-giornale", "Ugo Giornale");
    await db.insert(memories).values({ gosinoId: house.creatureId, kind: "fact", text: "Il corriere passa il martedì", importance: 0.8 });
    const denied = await post(house.token, { gosinoId: house.creatureId, confirmName: "sbagliato" });
    expect(denied.statusCode).toBe(422);
    const response = await post(house.token, { gosinoId: house.creatureId, confirmName: "Ugo Giornale", passphrase: "frase segretissima 12345" });
    expect(response.statusCode).toBe(200);
    // con la frase scelta l'intestazione non c'è: il codice da cercare è la frase stessa
    const rows = await db.select().from(auditLog).where(eq(auditLog.resourceId, house.creatureId));
    expect(rows.map((r) => [r.verb, r.outcome]).sort()).toEqual([
      ["soul_export", "denied"],
      ["soul_export", "ok"],
    ]);
    expect(rows.every((r) => r.resourceType === "gosino")).toBe(true);
    const dump = JSON.stringify(rows);
    for (const secret of ["frase segretissima", "martedì", "Ugo Giornale", "sbagliato"]) {
      expect(dump, secret).not.toContain(secret); // nel giornale solo id e verbi
    }
  });

  it("e con il codice generato: nemmeno quello entra nel giornale", async () => {
    const house = await freshHouse("casa-giornale-due", "Ugo Due");
    const response = await post(house.token, { gosinoId: house.creatureId, confirmName: "Ugo Due" });
    expect(response.statusCode).toBe(200);
    const code = String(response.headers["x-ugo-recovery-code"]);
    expect(code).toMatch(RECOVERY_CODE);
    const dump = JSON.stringify(await db.select().from(auditLog).where(eq(auditLog.resourceId, house.creatureId)));
    expect(dump).not.toContain(code);
    expect(dump).not.toContain(code.replaceAll("-", ""));
  });
});

describe("un limite, perché un archivio è la copia più completa che ci sia", () => {
  it("dopo tre in un'ora la quarta aspetta, e lo dice; le altre case non ne risentono", async () => {
    for (let i = 0; i < 3; i += 1) {
      const ok = await post(neighbourToken, { gosinoId: neighbourCreatureId, confirmName: "Altro" });
      expect(ok.statusCode, `export ${String(i)}`).toBe(200);
    }
    const fourth = await post(neighbourToken, { gosinoId: neighbourCreatureId, confirmName: "Altro" });
    expect(fourth.statusCode).toBe(429);
    expect(Number(fourth.headers["retry-after"])).toBeGreaterThan(0);
    // il limite è per casa: una casa nuova parte da zero
    const free = await freshHouse("casa-libera", "Libero");
    expect((await post(free.token, { gosinoId: free.creatureId, confirmName: "Libero" })).statusCode).toBe(200);
  });
});

describe("una creatura congedata non si porta via", () => {
  it("risponde 404 come una che non c'è", async () => {
    await db.update(gosini).set({ retiredAt: new Date() }).where(eq(gosini.id, creatureId));
    expect((await post(ownerToken, { gosinoId: creatureId, confirmName: "Ugo Mio" })).statusCode).toBe(404);
    const options = await on.inject({ method: "GET", url: "/v1/privacy/soul-export/options", headers: { authorization: `Bearer ${ownerToken}` } });
    expect(options.json<{ creatures: unknown[] }>().creatures).toEqual([]);
  });
});
