import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  type DbClient,
  feedItems,
  rssFeeds,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
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
 * La rassegna (ADR-080) sul giro vero.
 *
 * Le tre cose che solo un database può dire: che i titoli **escano** (finora
 * uscivano due contatori), che escano **in ordine di pubblicazione** e non di
 * scaricamento, e che un feed **spento** taccia — perché spegnere un feed e
 * continuare a sentirlo sarebbe peggio che non poterlo spegnere.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let chat: ChatService;
let token: string;
let houseId: string;
let spentoId: string;

const NOW = new Date("2026-08-18T09:00:00.000Z");
const say = (text: string) => chat.handle({ channel: "home", text }, NOW);

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-feed",
    name: "Feed",
    gosinoName: "Ugo",
  });
  token = house.ownerToken;
  houseId = house.accountId;

  const [ilPost] = await db
    .insert(rssFeeds)
    .values({ accountId: houseId, url: "https://ilpost.it/feed", label: "Il Post" })
    .returning({ id: rssFeeds.id });
  const [spento] = await db
    .insert(rssFeeds)
    .values({
      accountId: houseId,
      url: "https://spam.example/feed",
      label: "Volantini",
      enabled: false,
    })
    .returning({ id: rssFeeds.id });
  if (ilPost === undefined || spento === undefined) throw new Error("no feeds");
  spentoId = spento.id;

  await db.insert(feedItems).values([
    {
      accountId: houseId,
      feedId: ilPost.id,
      guid: "vecchio",
      title: "Una cosa di tre giorni fa",
      publishedAt: new Date("2026-08-15T08:00:00.000Z"),
    },
    {
      accountId: houseId,
      feedId: ilPost.id,
      guid: "fresco",
      title: "Il telescopio ha visto una cosa nuova",
      link: "https://ilpost.it/telescopio",
      publishedAt: new Date("2026-08-18T07:00:00.000Z"),
    },
    {
      accountId: houseId,
      feedId: spento.id,
      guid: "spam",
      title: "SCONTI IMPERDIBILI",
      publishedAt: new Date("2026-08-18T08:00:00.000Z"),
    },
  ]);

  chat = new ChatService({
    db,
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: {
      chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
    } as never,
    psyche: await PsycheService.restore(db, NOW, house.gosinoId),
    dataKey: DATA_KEY,
    timezone: "UTC",
    locale: "it-IT",
    gosinoId: house.gosinoId,
    accountId: houseId,
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

interface Item {
  title: string;
  feed: string;
  link: string | null;
  publishedAt: string | null;
}

const items = async (): Promise<Item[]> => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/feeds/items",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ items: Item[] }>().items;
};

describe("GET /v1/feeds/items — i titoli escono", () => {
  it("dal più recente, per data di PUBBLICAZIONE", async () => {
    const rows = await items();
    expect(rows.map((row) => row.title)).toEqual([
      "Il telescopio ha visto una cosa nuova",
      "Una cosa di tre giorni fa",
    ]);
    expect(rows[0]?.feed).toBe("Il Post");
    expect(rows[0]?.link).toBe("https://ilpost.it/telescopio");
  });

  it("un feed spento tace, anche se ha l'articolo più fresco", async () => {
    // spegnere un feed e continuare a sentirlo sarebbe peggio che non poterlo spegnere
    const rows = await items();
    expect(rows.map((row) => row.title)).not.toContain("SCONTI IMPERDIBILI");
  });

  it("il vicino non legge i nostri feed", async () => {
    const other = await createAccount(db, MASTER_KEY, { slug: "vicina", name: "Vicina" });
    const response = await app.inject({
      method: "GET",
      url: "/v1/feeds/items",
      headers: { authorization: `Bearer ${other.ownerToken}` },
    });
    expect(response.json<{ items: Item[] }>().items).toEqual([]);
  });
});

describe("«che notizie ci sono?» — e risponde lui, gratis", () => {
  it("legge i titoli, con la fonte, senza sfiorare il provider", async () => {
    const answer = await say("che notizie ci sono?");
    expect(answer.reply).toContain("Da Il Post: Il telescopio ha visto una cosa nuova.");
    expect(answer.reply).not.toContain("SCONTI");
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("quante ne vuoi è quante ne dici", async () => {
    const answer = await say("leggimi una notizia");
    expect(answer.reply).toContain("Una cosa sola");
    expect(answer.reply).not.toContain("tre giorni fa");
  });

  it("senza feed accesi lo dice, e non è la stessa cosa di «niente di nuovo»", async () => {
    await db.update(rssFeeds).set({ enabled: false }).where(eq(rssFeeds.accountId, houseId));
    expect((await say("che notizie ci sono?")).reply).toContain("Non sei iscritto");
    // e con un feed acceso ma vuoto, l'altra risposta
    await db.update(rssFeeds).set({ enabled: true }).where(eq(rssFeeds.id, spentoId));
    await db.delete(feedItems).where(eq(feedItems.accountId, houseId));
    expect((await say("che notizie ci sono?")).reply).toContain("niente di nuovo");
  });
});
