import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  type DbClient,
  diaryEntries,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import {
  createAccount,
  createAccountWithFounder,
} from "../../src/services/accountService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";

/**
 * Il libro della vita (ADR-079) sul giro vero.
 *
 * Tre cose che solo un database può dire:
 *
 * 1. che il diario **esca davvero**, dopo essere stato scritto e mai letto;
 * 2. che «cos'hai fatto ieri?» risponda con **le sue parole**, senza sfiorare
 *    il provider e senza lasciare niente sul `budget_ledger`;
 * 3. che il lettore regga **entrambi i mondi** — il sogno scrive in chiaro
 *    oggi, e una pagina cifrata deve leggersi lo stesso.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let chat: ChatService;
let token: string;
let who: string;

/** Il pomeriggio del 18, quindi «ieri» è il 17. */
const TODAY = new Date("2026-08-18T15:00:00.000Z");

const say = (text: string, at: Date = TODAY) => chat.handle({ channel: "home", text }, at);

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-diario",
    name: "Diario",
    gosinoName: "Ugo",
  });
  token = house.ownerToken;
  who = house.gosinoId;

  await db.insert(diaryEntries).values([
    {
      gosinoId: who,
      date: "2026-08-17",
      // come lo scrive il sogno oggi: in chiaro
      text: "Oggi è passato il corriere e mi sono spaventato, poi mi hanno grattato il muso.",
      moodSummary: { umore: 0.62, stress: 0.4, last_label: "sereno" },
    },
    {
      gosinoId: who,
      date: "2026-08-16",
      // e una pagina cifrata, per il giorno in cui il sogno cambierà idea
      text: encryptText("Giornata calma, non è successo niente di speciale.", DATA_KEY),
      moodSummary: { umore: 0.5 },
    },
  ]);

  chat = new ChatService({
    db,
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: {
      chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
    } as never,
    psyche: await PsycheService.restore(db, TODAY, who),
    dataKey: DATA_KEY,
    timezone: "UTC",
    locale: "it-IT",
    gosinoId: who,
    accountId: house.accountId,
    character: characterFrom({}),
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

interface Page {
  date: string;
  text: string;
  mood: Record<string, unknown>;
}

const read = async (query = ""): Promise<Page[]> => {
  const response = await app.inject({
    method: "GET",
    url: `/v1/diary${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ pages: Page[] }>().pages;
};

describe("GET /v1/diary — il libro esce", () => {
  it("le notti in ordine, dalla più recente", async () => {
    const pages = await read();
    expect(pages.map((page) => page.date)).toEqual(["2026-08-17", "2026-08-16"]);
    expect(pages[0]?.text).toContain("corriere");
  });

  it("legge in chiaro una pagina cifrata, e in chiaro una in chiaro", async () => {
    // il sogno oggi scrive in chiaro; il lettore non deve dipendere da quello
    const pages = await read();
    expect(pages[1]?.text).toBe("Giornata calma, non è successo niente di speciale.");
  });

  it("porta l'umore di quella giornata, che è metà del senso di un diario", async () => {
    const [yesterday] = await read();
    expect(yesterday?.mood.last_label).toBe("sereno");
    expect(Number(yesterday?.mood.umore)).toBeCloseTo(0.62, 2);
  });

  it("il vicino non legge il diario di casa nostra", async () => {
    const other = await createAccount(db, MASTER_KEY, { slug: "vicina", name: "Vicina" });
    const response = await app.inject({
      method: "GET",
      url: "/v1/diary",
      headers: { authorization: `Bearer ${other.ownerToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ pages: Page[] }>().pages).toEqual([]);
  });

  it("senza token non si legge niente", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/diary" });
    expect(response.statusCode).toBe(401);
  });
});

describe("«cos'hai fatto ieri?» — e risponde lui, gratis", () => {
  it("racconta la pagina di ieri con le sue parole", async () => {
    const answer = await say("cos'hai fatto ieri?");
    expect(answer.reply).toContain("corriere");
    // parola per parola: riassumere il riassunto vorrebbe dire chiamare il provider
    expect(answer.reply).toBe(
      "Oggi è passato il corriere e mi sono spaventato, poi mi hanno grattato il muso.",
    );
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("«leggimi il diario» è il libro, non la giornata", async () => {
    const answer = await say("leggimi il diario");
    expect(answer.reply).toContain("2026-08-17");
    expect(answer.reply).toContain("Giornata calma");
  });

  it("una notte senza pagina lo dice, invece di inventarla", async () => {
    const answer = await say("cos'hai fatto oggi?");
    expect(answer.reply).toContain("non ho scritto niente");
  });

  it("una frase che parla di ieri NON è una domanda sul suo diario", async () => {
    // se questa passasse dal gesto, il provider chiuso non se ne accorgerebbe:
    // qui il provider è una porta chiusa, quindi ci pensa l'errore
    await expect(say("ieri sono stato al mare")).rejects.toThrow();
  });
});
