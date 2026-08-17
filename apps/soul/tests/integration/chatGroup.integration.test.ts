import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  createDbClient,
  gosini,
  households,
  messages,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import type { EmbeddingsClient, LlmClient, LlmHistoryTurn } from "@ugo/memory";
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
 * Postgres vero; il provider è uno stub che cattura la history.
 */

const flatEmbedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0))),
};

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let gosinoId = "";
let ivan = "";
let paola = "";
const dataKey = randomBytes(32);
const heardHistory: LlmHistoryTurn[][] = [];

const capturingLlm = {
  chat: (input: { history: LlmHistoryTurn[] }) => {
    heardHistory.push(input.history);
    return Promise.resolve({ text: "Grunf! Vi seguo tutti e due.", usage: undefined, costUsd: 0 });
  },
} as unknown as LlmClient;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const [house] = await db.select({ id: households.id }).from(households).limit(1);
  const householdId = house?.id ?? "";
  const [pig] = await db
    .insert(gosini)
    .values({ householdId, name: "ugo-gruppo" })
    .returning({ id: gosini.id });
  gosinoId = pig?.id ?? "";
  const two = await db
    .insert(beings)
    .values([
      { householdId, displayName: "Ivan" },
      { householdId, displayName: "Paola" },
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
  await pg.stop();
});

async function chat(): Promise<ChatService> {
  return new ChatService({
    db,
    embedder: flatEmbedder,
    llm: capturingLlm,
    psyche: await PsycheService.restore(db, new Date(), gosinoId),
    dataKey,
    gosinoId,
    character: characterFrom({}),
  });
}

describe("il filo della stanza", () => {
  it("in casa UGO rilegge TUTTI, col nome davanti — e il filo API resta fuori", async () => {
    const service = await chat();
    await service.handle({ channel: "home", text: "a che ora partiamo?", beingId: ivan });
    const history = heardHistory.at(-1) ?? [];
    const texts = history.map((turn) => turn.content);
    expect(texts).toContain("Ivan: domani andiamo al lago");
    expect(texts).toContain("Paola: io porto i panini");
    // la risposta di UGO resta senza prefisso: parla lui, non un ospite
    expect(texts).toContain("Grunf! Che bello, il lago!");
    expect(texts.join("\n")).not.toContain("faccenda privata");
  });

  it("sull'API lo scoping per persona di ADR-032 non si è mosso", async () => {
    const service = await chat();
    await service.handle({ channel: "api", text: "dimmi solo le mie cose", beingId: ivan });
    const texts = (heardHistory.at(-1) ?? []).map((turn) => turn.content);
    expect(texts.join("\n")).toContain("faccenda privata");
    expect(texts.join("\n")).not.toContain("panini");
    // e niente nomi davanti: il filo è già suo
    expect(texts.join("\n")).not.toContain("Ivan:");
  });
});
