import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  diaryEntries,
  gosini,
  memories,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText, encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FarewellService } from "../../src/services/farewellService.js";
import { createHousehold } from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * Il congedo (ADR-075) su database vero.
 *
 * La prova che rende la morte una cosa seria: dopo, ciò che era cifrato con
 * la chiave dell'esemplare **non si apre più** — nemmeno da qui dentro, con
 * il database in mano e la chiave di casa a disposizione. E il lascito sì.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let token: string;
let who: string;
let farewells: FarewellService;

const post = (url: string, body: unknown, useToken = token) =>
  app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${useToken}`, "content-type": "application/json" },
    payload: JSON.stringify(body ?? {}),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createHousehold(db, MASTER_KEY, {
    slug: "casa-congedo",
    name: "Congedo",
    gosinoName: "Vecchio",
  });
  token = house.ownerToken;
  who = house.gosinoId;
  farewells = new FarewellService(db, DATA_KEY);

  await db.insert(memories).values([
    {
      gosinoId: who,
      kind: "fact",
      text: encryptText("Il compressore va spurgato ogni lunedì", DATA_KEY),
      importance: 0.9,
    },
    {
      gosinoId: who,
      kind: "insight",
      text: encryptText("Le viti M3 con inserto a caldo tengono meglio", DATA_KEY),
      importance: 0.8,
    },
  ]);
  // il diario è scopato per esemplare, non per casa: `household_id` qui non
  // esiste, e passarlo era un campo di troppo che nessun tipo controllava
  await db.insert(diaryEntries).values({
    gosinoId: who,
    date: "2026-08-17",
    text: encryptText("Oggi è stata una buona giornata", DATA_KEY),
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: { dataKey: DATA_KEY },
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("la chiave dell'interiorità", () => {
  it("si conia alla prima occasione, e resta la stessa", async () => {
    const first = await farewells.soulKeyFor(who);
    if (first === undefined) throw new Error("nessuna chiave coniata");
    expect(first).toHaveLength(32);
    const again = await farewells.soulKeyFor(who);
    expect(again?.equals(first)).toBe(true);
    // e non è la chiave della casa: è l'unica cosa che rende la morte vera
    expect(first.equals(DATA_KEY)).toBe(false);
  });

  it("è conservata AVVOLTA, non in chiaro", async () => {
    const [row] = await db
      .select({ wrapped: gosini.wrappedSoulKey })
      .from(gosini)
      .where(eq(gosini.id, who));
    const key = await farewells.soulKeyFor(who);
    if (key === undefined) throw new Error("nessuna chiave");
    expect(row?.wrapped).not.toBeNull();
    expect(row?.wrapped?.equals(key)).toBe(false);
  });
});

describe("l'anteprima del congedo", () => {
  it("dice cosa resterebbe, prima di decidere", async () => {
    const response = await post(`/v1/gosini/${who}/farewell/preview`, {});
    expect(response.statusCode).toBe(200);
    const preview = response.json<{
      name: string;
      legacy: number;
      diaryEntries: number;
      alreadyGone: boolean;
    }>();
    expect(preview.name).toBe("Vecchio");
    expect(preview.legacy).toBe(2);
    expect(preview.diaryEntries).toBe(1);
    expect(preview.alreadyGone).toBe(false);
  });

  it("il vicino non guarda i congedi altrui", async () => {
    const other = await createHousehold(db, MASTER_KEY, { slug: "vicina", name: "Vicina" });
    const response = await post(`/v1/gosini/${who}/farewell/preview`, {}, other.ownerToken);
    expect(response.statusCode).toBe(404);
  });
});

describe("il congedo", () => {
  it("chiede il nome: un click solo non è un consenso a una cosa irreversibile", async () => {
    const response = await post(`/v1/gosini/${who}/farewell`, { confirmName: "Sbagliato" });
    expect(response.statusCode).toBe(400);
    const [alive] = await db.select({ gone: gosini.retiredAt }).from(gosini).where(eq(gosini.id, who));
    expect(alive?.gone).toBeNull();
  });

  it("dopo, l'intimo NON si apre più — e il lascito sì", async () => {
    // qualcosa di intimo, cifrato con la SUA chiave
    const soulKey = await farewells.soulKeyFor(who);
    if (soulKey === undefined) throw new Error("nessuna chiave");
    const secret = encryptText("Quello che mi ha detto quella sera", soulKey);

    const response = await post(`/v1/gosini/${who}/farewell`, { confirmName: "Vecchio" });
    expect(response.statusCode).toBe(200);
    const result = response.json<{ legacyKept: number; soulKeyDestroyed: boolean }>();
    expect(result.soulKeyDestroyed).toBe(true);
    expect(result.legacyKept).toBe(2);

    // l'involucro non c'è più: la chiave non era nel database, era avvolta lì
    const [row] = await db
      .select({ wrapped: gosini.wrappedSoulKey, gone: gosini.retiredAt })
      .from(gosini)
      .where(eq(gosini.id, who));
    expect(row?.wrapped).toBeNull();
    expect(row?.gone).not.toBeNull();

    // e da qui dentro, con la chiave di casa in mano, quel testo non si apre
    expect(() => decryptText(secret, DATA_KEY)).toThrow();
    // nemmeno chiedendo di nuovo la chiave: un morto non ne riceve una nuova
    expect(await farewells.soulKeyFor(who)).toBeUndefined();

    // il lascito invece è leggibile: è stato riscritto con la chiave di casa
    const kept = await db
      .select({ text: memories.text, refs: memories.sourceRefs })
      .from(memories)
      .where(eq(memories.gosinoId, who));
    const legacy = kept.filter((row) => (row.refs as { legacy?: boolean }).legacy === true);
    expect(legacy).toHaveLength(2);
    expect(legacy.map((row) => decryptText(row.text, DATA_KEY)).join(" ")).toContain("compressore");

    // e il libro della vita resta: la morte non è l'oblio
    const diary = await db
      .select({ text: diaryEntries.text })
      .from(diaryEntries)
      .where(eq(diaryEntries.gosinoId, who));
    expect(diary).toHaveLength(1);
    expect(decryptText(diary[0]?.text ?? "", DATA_KEY)).toContain("buona giornata");
  });

  it("non si muore due volte", async () => {
    const response = await post(`/v1/gosini/${who}/farewell`, { confirmName: "Vecchio" });
    expect(response.statusCode).toBe(409);
  });
});
