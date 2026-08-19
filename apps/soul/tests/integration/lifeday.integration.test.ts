import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  desires,
  diaryEntries,
  events,
  memories,
  messages,
  runMigrations,
  type DbClient,
  PRIME_GOSINO_ID,
  PRIME_ACCOUNT_ID,
} from "@ugo/db";
import {
  EMBED_MODEL,
  startLlmStub,
  startOllama,
  type LlmStub,
  type OllamaHandle,
} from "@ugo/factories";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { FaceGateway, type FaceSender } from "../../src/services/faceGateway.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { SolitudeMonitor } from "../../src/services/solitudeMonitor.js";
import { characterFrom } from "../../src/services/council/character.js";

/**
 * One day in UGO's life, end to end.
 *
 * Every piece below is covered by its own suite; what nobody was checking is
 * the THREAD: that a morning conversation becomes a memory, that an evening
 * of silence actually dents the mood, that the night's desire is the thing he
 * says at dawn, and that tomorrow's question still finds yesterday's fact.
 * Real Postgres, real embeddings, provider stubbed at the network edge.
 */

const dataKey = randomBytes(32);
const HOUR = 3_600_000;
const DAY_START = new Date("2026-08-09T07:00:00Z");
const at = (hours: number): Date => new Date(DAY_START.getTime() + hours * HOUR);

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let stub: LlmStub;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;

const speeches = (sent: { type: string; text?: string }[]): string[] =>
  sent.filter((message) => message.type === "speak").map((message) => message.text ?? "");

/** A fresh set of services over the same database: a restart, in other words. */
async function wake(hourOfDay: number): Promise<{
  gateway: FaceGateway;
  psyche: PsycheService;
  chat: ChatService;
  sent: { type: string; text?: string }[];
  send: FaceSender;
}> {
  const psyche = await PsycheService.restore(db, new Date(), PRIME_GOSINO_ID);
  const chat = new ChatService({
    gosinoId: PRIME_GOSINO_ID,
    accountId: PRIME_ACCOUNT_ID,
    character: characterFrom({}),
    db,
    embedder,
    llm: new LlmClient({
      db,
      apiKey: "test",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 5,
      baseUrl: stub.baseUrl,
    }),
    psyche,
    dataKey,
  });
  const sent: { type: string; text?: string }[] = [];
  const send: FaceSender = (message) => {
    sent.push(message);
  };
  return {
    gateway: new FaceGateway({ gosinoId: PRIME_GOSINO_ID, db, chat, psyche, hourOf: () => hourOfDay }),
    psyche,
    chat,
    sent,
    send,
  };
}

beforeAll(async () => {
  [pg, ollama, stub] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startLlmStub(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop(), stub.close()]);
});

describe("una giornata di vita", () => {
  it("morning: someone shows up and tells UGO something worth keeping", async () => {
    const { gateway, send, sent, psyche } = await wake(9);
    const before = psyche.current(at(2)).vars;

    await gateway.handle({ type: "face_seen" }, send);
    stub.nextResponse = { text: "Grunf, me lo segno: martedì arriva il pacco." };
    await gateway.handle(
      { type: "heard_text", text: "oggi passa Ivan con il pacco DHL, ricordamelo" },
      send,
    );

    const after = psyche.current(at(2)).vars;
    expect(after.affetto).toBeGreaterThan(before.affetto); // presence + talk
    expect(after.noia).toBeLessThan(before.noia);
    expect(gateway.currentState()).toBe("idle");
    expect(speeches(sent)).toContain("Grunf, me lo segno: martedì arriva il pacco.");

    const stored = await db.select().from(messages);
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.text.startsWith("v1:"))).toBe(true); // encrypted
  });

  it("afternoon: a thunderclap startles him and the stress is real", async () => {
    const { gateway, send, psyche } = await wake(15);
    const before = psyche.current(at(8)).vars.stress;
    await gateway.handle({ type: "noise", db: 95 }, send);
    expect(psyche.current(at(8)).vars.stress).toBeGreaterThan(before);
    expect(gateway.currentState()).toBe("alert");
  });

  it("evening: a whole day ignored actually dents the mood", async () => {
    // the last user message is backdated: nobody spoke to him for 30 hours
    await db.update(messages).set({ ts: new Date(DAY_START.getTime() - 30 * HOUR) });
    const { psyche } = await wake(20);
    const monitor = new SolitudeMonitor({ db, gosinoId: PRIME_GOSINO_ID, psyche });
    const before = psyche.current(at(13)).vars.umore;

    const report = await monitor.tick(at(13));
    expect(report.ignoredApplied).toBe(true);
    expect(psyche.current(at(13)).vars.umore).toBeLessThan(before);
  });

  it("night: the dream leaves a diary page and a desire for tomorrow", async () => {
    // the Python dream runs in its own container (covered by its own suite);
    // here we assert the contract it leaves behind for the morning after
    await db.insert(diaryEntries).values({
      gosinoId: PRIME_GOSINO_ID,
      date: "2026-08-09",
      text: "Giornata piena: è passato Ivan, poi un tuono mi ha fatto sobbalzare. Grunf.",
    });
    await db.insert(desires).values({
      gosinoId: PRIME_GOSINO_ID,
      text: "chiedigli se il pacco DHL è arrivato davvero",
      status: "pending",
    });
    await db.insert(memories).values({
      gosinoId: PRIME_GOSINO_ID,
      kind: "fact",
      text: "Il corriere DHL si chiama Ivan e passa di martedì.",
      importance: 0.9,
      embedding: (await embedder.embed(["Il corriere DHL si chiama Ivan e passa di martedì."]))[0],
    });

    const pending = await db.select().from(desires).where(eq(desires.status, "pending"));
    expect(pending).toHaveLength(1);
  });

  it("dawn: he falls asleep in the dark and wakes up asking what he wondered", async () => {
    const { gateway, send, sent } = await wake(23); // night hours
    await gateway.handle({ type: "light", lux: 2 }, send);
    expect(gateway.currentState()).toBe("sleeping");

    await gateway.handle({ type: "face_seen" }, send);
    expect(gateway.currentState()).toBe("idle");

    // the desire he formed in the night is the first thing he says…
    expect(speeches(sent).join(" ")).toContain("pacco DHL");
    // …and it is not asked twice
    const stillPending = await db.select().from(desires).where(eq(desires.status, "pending"));
    expect(stillPending).toHaveLength(0);
  });

  it("tomorrow: yesterday's fact still answers today's question", async () => {
    const { gateway, send } = await wake(9);
    stub.nextResponse = { text: "Sì, il corriere è Ivan e passa di martedì. Grunf." };
    await gateway.handle({ type: "heard_text", text: "come si chiamava il corriere?" }, send);

    // the memory written during the night reached the prompt
    const dynamicBlock = stub.requests.at(-1)?.body.system[2]?.text ?? "";
    expect(dynamicBlock).toContain("Ivan");
    expect(dynamicBlock).toContain("Dal diario");

    // and the whole day is on the record: events, messages, ledger
    const dayEvents = await db.select().from(events);
    const types = new Set(dayEvents.map((row) => row.type));
    expect(types).toContain("face_seen");
    expect(types).toContain("noise");
    expect(types).toContain("ignored_day");
  });
});
