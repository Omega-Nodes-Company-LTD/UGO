import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  messages,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { EMBED_MODEL, startLlmStub, startOllama, type LlmStub, type OllamaHandle } from "@ugo/factories";
import { DEGRADED_REPLY, LlmClient, OllamaEmbeddingsClient, writeMemory } from "@ugo/memory";
import { decryptText } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";

// Full vertical slice on real infrastructure: real Postgres+pgvector, real
// Ollama embeddings, network-level Messages-API stub (playbook §3 P2).

const MODEL = "claude-haiku-4-5";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let stub: LlmStub;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;

/** A fresh "session": new services over the same database, like a restart. */
async function buildSession(budgetUsd = 0.5): Promise<FastifyInstance> {
  const psyche = await PsycheService.restore(db);
  const llm = new LlmClient({
    db,
    apiKey: "test",
    model: MODEL,
    dailyBudgetUsd: budgetUsd,
    baseUrl: stub.baseUrl,
    timezone: "Europe/Rome",
  });
  const chat = new ChatService({ db, embedder, llm, psyche, dataKey });
  return buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: ollama.baseUrl,
    logger: false,
    features: { chat, psyche },
  });
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

describe("POST /v1/chat — the minimal soul (Fase 1 DoD)", () => {
  it("remembers a fact across sessions: memory reaches the prompt, reply returns", async () => {
    await writeMemory(db, embedder, {
      kind: "fact",
      text: "Il fattorino DHL si chiama Ivan e passa sempre il martedì.",
      importance: 0.9,
    });

    // session 1
    stub.nextResponse = { text: "Si chiama Ivan, passa il martedì. Grunf." };
    const first = await buildSession();
    const response = await first.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { channel: "home", text: "come si chiama il fattorino DHL?" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ reply: string; moodLabel: string; memoriesUsed: string[] }>();
    expect(body.reply).toContain("Ivan");
    expect(body.moodLabel.length).toBeGreaterThan(0);
    expect(body.memoriesUsed.length).toBeGreaterThan(0);

    const captured = stub.requests.at(-1);
    const dynamicBlock = captured?.body.system[2];
    expect(dynamicBlock?.text).toContain("Ivan");
    expect(dynamicBlock?.cache_control).toBeUndefined();
    expect(captured?.body.system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(captured?.body.system[1]?.cache_control).toEqual({ type: "ephemeral" });
    await first.close();

    // session 2: fresh services over the same database (restart simulation)
    const second = await buildSession();
    const followUp = await second.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { channel: "home", text: "e quando passa di solito?" },
    });
    expect(followUp.statusCode).toBe(200);
    const secondCapture = stub.requests.at(-1);
    // block 5: the previous session's turns are in the history, decrypted
    const historyContents = secondCapture?.body.messages.map((m) => m.content) ?? [];
    expect(historyContents.some((c) => c.includes("fattorino DHL"))).toBe(true);
    // and the memory block is still fed from pgvector
    expect(secondCapture?.body.system[2]?.text).toContain("Ivan");
    await second.close();
  });

  it("persists both turns encrypted at rest, with cost on the assistant row", async () => {
    const rows = await db.select().from(messages);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      expect(row.text.startsWith("v1:")).toBe(true);
      expect(row.text).not.toContain("fattorino");
      expect(() => decryptText(row.text, dataKey)).not.toThrow();
    }
    const assistantRows = rows.filter((row) => row.role === "assistant");
    expect(assistantRows.some((row) => Number(row.costUsd) > 0)).toBe(true);
  });

  it("records every provider call in the ledger (the piggy bank)", async () => {
    const ledger = await db.select().from(budgetLedger);
    expect(ledger.length).toBeGreaterThanOrEqual(2);
    expect(ledger.every((row) => row.model === MODEL)).toBe(true);
  });

  it("degrades with the declared reply when the daily budget is gone", async () => {
    const providerHitsBefore = stub.requests.length;
    const broke = await buildSession(0.000001);
    const response = await broke.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { channel: "home", text: "ci sei?" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ reply: string }>().reply).toBe(DEGRADED_REPLY);
    expect(stub.requests.length).toBe(providerHitsBefore); // provider untouched
    await broke.close();
  });

  it("validates input at the boundary (RFC 7807)", async () => {
    const app = await buildSession();
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { channel: "telegram", text: "" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    await app.close();
  });
});

describe("psyche endpoints", () => {
  it("GET /v1/psyche returns vars and label; events shift the state", async () => {
    const app = await buildSession();
    const before = await app.inject({ method: "GET", url: "/v1/psyche" });
    expect(before.statusCode).toBe(200);
    const beforeBody = before.json<{ vars: { stress: number }; label: string }>();

    for (let i = 0; i < 2; i += 1) {
      const posted = await app.inject({
        method: "POST",
        url: "/v1/events",
        payload: { source: "face", type: "loud_noise", payload: { db: 92 } },
      });
      expect(posted.statusCode).toBe(201);
      expect(posted.json<{ id: string }>().id).toBeDefined();
    }

    const after = await app.inject({ method: "GET", url: "/v1/psyche" });
    const afterBody = after.json<{ vars: { stress: number }; label: string }>();
    expect(afterBody.vars.stress).toBeGreaterThan(beforeBody.vars.stress);
    expect(afterBody.label.length).toBeGreaterThan(0);
    await app.close();
  });
});

describe("debug surface", () => {
  it("GET /v1/memories/search ranks the DHL memory first for a related query", async () => {
    const app = await buildSession();
    const response = await app.inject({
      method: "GET",
      url: "/v1/memories/search?q=chi%20consegna%20i%20pacchi%3F&k=3",
    });
    expect(response.statusCode).toBe(200);
    const results = response.json<{ text: string }[]>();
    expect(results[0]?.text).toContain("Ivan");
    await app.close();
  });

  it("GET /debug/chat serves the mini chat page", async () => {
    const app = await buildSession();
    const response = await app.inject({ method: "GET", url: "/debug/chat" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("chat-input");
    await app.close();
  });
});
