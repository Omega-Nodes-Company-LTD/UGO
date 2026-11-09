import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  createDbClient,
  gosini,
  accounts,
  messages,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { EMBED_MODEL, openRouterKey, startOllama, type OllamaHandle } from "@ugo/factories";
import { DEFAULT_CHAT_MODEL, LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import { encryptText } from "@ugo/shared";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { PsycheService } from "../../src/services/psycheService.js";

/**
 * La chat di gruppo (ADR-067): sul canale di CASA il filo è della stanza —
 * UGO rilegge i turni di tutti, col nome davanti, e può seguire una
 * conversazione a più voci. Sull'API resta lo scoping per persona (ADR-032).
 *
 * Tutto vero (ADR-125): Postgres, Ollama per gli embedding, OpenRouter. Il
 * filo non si legge più da una richiesta catturata: si chiede al modello
 * qualcosa che può sapere SOLO se il filo giusto gli è arrivato.
 */

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let gosinoId = "";
let accountId = "";
let ivan = "";
let paola = "";
const dataKey = randomBytes(32);

beforeAll(async () => {
  [pg, ollama] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
  ]);
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const [house] = await db.select({ id: accounts.id }).from(accounts).limit(1);
  accountId = house?.id ?? "";
  const [pig] = await db
    .insert(gosini)
    .values({ accountId, name: "ugo-gruppo" })
    .returning({ id: gosini.id });
  gosinoId = pig?.id ?? "";
  const two = await db
    .insert(beings)
    .values([
      { accountId, displayName: "Ivan" },
      { accountId, displayName: "Paola" },
    ])
    .returning({ id: beings.id });
  ivan = two[0]?.id ?? "";
  paola = two[1]?.id ?? "";

  // la conversazione di stanza, già avvenuta: Ivan e Paola si alternano
  const now = Date.now();
  await db.insert(messages).values([
    {
      gosinoId,
      channel: "home",
      role: "user",
      beingId: ivan,
      ts: new Date(now - 60_000),
      text: encryptText("domani andiamo al lago", dataKey),
    },
    {
      gosinoId,
      channel: "home",
      role: "assistant",
      ts: new Date(now - 59_000),
      text: encryptText("Grunf! Che bello, il lago!", dataKey),
    },
    {
      gosinoId,
      channel: "home",
      role: "user",
      beingId: paola,
      ts: new Date(now - 30_000),
      text: encryptText("io porto i panini", dataKey),
    },
    // e un filo API di Ivan, che NON deve entrare nel gruppo di casa
    {
      gosinoId,
      channel: "api",
      role: "user",
      beingId: ivan,
      ts: new Date(now - 20_000),
      text: encryptText("questa è una faccenda privata", dataKey),
    },
  ]);
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop()]);
});

async function chat(): Promise<ChatService> {
  return new ChatService({
    db,
    embedder: new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL),
    llm: new LlmClient({
      db,
      apiKey: openRouterKey(),
      model: DEFAULT_CHAT_MODEL,
      dailyBudgetUsd: 1,
      accountId,
      gosinoId,
      timezone: "Europe/Rome",
    }),
    psyche: await PsycheService.restore(db, new Date(), gosinoId),
    dataKey,
    gosinoId,
    accountId,
    character: characterFrom({}),
  });
}

describe("il filo della stanza", () => {
  it("in casa UGO rilegge TUTTI, col nome davanti", async () => {
    const service = await chat();
    // lo chiede Ivan, e l'ha detto Paola: lo sa solo se il filo è della stanza
    // e porta i nomi davanti
    const answer = await service.handle({
      channel: "home",
      text: "chi di noi porta i panini? rispondi col nome",
      beingId: ivan,
    });
    expect(answer.reply.toLowerCase()).toContain("paola");
  });

  it("sull'API lo scoping per persona di ADR-032 non si è mosso", async () => {
    const service = await chat();
    // il filo API di Ivan c'è…
    const own = await service.handle({
      channel: "api",
      text: "ripeti tra virgolette, parola per parola, il messaggio che ti ho scritto prima di questo",
      beingId: ivan,
    });
    expect(own.reply.toLowerCase()).toContain("faccenda");
    // …e la stanza no: di Paola e dei panini, sull'API, non sa niente
    const room = await service.handle({
      channel: "api",
      text: "chi porta i panini? se non lo sai, dì solo «non lo so»",
      beingId: ivan,
    });
    expect(room.reply.toLowerCase()).not.toContain("paola");
  });
});
