import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { identityPrompt, rulesPrompt } from "@ugo/prompts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEGRADED_REPLY, LlmClient } from "../../src/llmClient.js";
import { computeCostUsd } from "../../src/pricing.js";
import { startLlmStub, type LlmStub } from "./llm-stub-server.js";

// Real Postgres ledger + network-level provider stub (playbook §3 P2).

const MODEL = "claude-haiku-4-5";
const TZ = "Europe/Rome";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let stub: LlmStub;

const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

function makeClient(dailyBudgetUsd: number, warnSink?: Record<string, unknown>[]): LlmClient {
  return new LlmClient({
    db,
    apiKey: "test-key",
    model: MODEL,
    dailyBudgetUsd,
    baseUrl: stub.baseUrl,
    timezone: TZ,
    logger: {
      warn: (data) => warnSink?.push(data),
    },
  });
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  stub = await startLlmStub();
});

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
  await stub.close();
});

afterEach(async () => {
  await db.delete(budgetLedger);
  stub.reset();
});

describe("prompt-cache discipline (§5.5)", () => {
  it("marks exactly the first two system blocks with cache_control, dynamic after", async () => {
    const client = makeClient(0.5);
    await client.chat({
      channel: "home",
      dynamicSystem: "Stato: sereno. Memorie: il gatto si chiama Bruno.",
      userText: "ciao!",
    });
    const request = stub.requests[0];
    expect(request).toBeDefined();
    const system = request?.body.system ?? [];
    expect(system[0]?.text).toBe(identityPrompt());
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(system[1]?.text).toBe(rulesPrompt());
    expect(system[1]?.cache_control).toEqual({ type: "ephemeral" });
    expect(system[2]?.text).toContain("Bruno");
    expect(system[2]?.cache_control).toBeUndefined();
  });

  it("keeps the cached prefix byte-identical across calls with different dynamic content", async () => {
    const client = makeClient(0.5);
    await client.chat({ channel: "home", dynamicSystem: "Stato: gasato.", userText: "prima" });
    await client.chat({ channel: "meeting", dynamicSystem: "Stato: mogio.", userText: "seconda" });
    const [first, second] = stub.requests;
    expect(first?.body.system[0]?.text).toBe(second?.body.system[0]?.text);
    expect(first?.body.system[1]?.text).toBe(second?.body.system[1]?.text);
    // channel drives max_tokens: 200 home, 300 meeting
    expect(first?.body.max_tokens).toBe(200);
    expect(second?.body.max_tokens).toBe(300);
  });

  it("orders blocks 5-6 after the system: history then user text", async () => {
    const client = makeClient(0.5);
    await client.chat({
      channel: "home",
      history: [
        { role: "user", content: "come stai?" },
        { role: "assistant", content: "Grunf, benone." },
      ],
      userText: "e adesso?",
    });
    const messages = stub.requests[0]?.body.messages ?? [];
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages.at(-1)?.content).toBe("e adesso?");
  });
});

describe("the piggy bank (budget_ledger)", () => {
  it("records every call with the cost computed from real usage", async () => {
    stub.nextResponse = {
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 2000,
      },
    };
    const client = makeClient(0.5);
    const result = await client.chat({ channel: "home", userText: "ciao" });

    const expectedCost = computeCostUsd(MODEL, {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 2000,
    });
    expect(result.costUsd).toBeCloseTo(expectedCost, 9);

    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(MODEL);
    expect(rows[0]?.date).toBe(today());
    expect(rows[0]?.tokensIn).toBe(3100);
    expect(rows[0]?.tokensOut).toBe(50);
    expect(Number(rows[0]?.costUsd)).toBeCloseTo(expectedCost, 6);
  });

  it("degrades with the declared reply once the daily budget is spent", async () => {
    await db.insert(budgetLedger).values({
      date: today(),
      provider: "anthropic",
      model: MODEL,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: "0.600000",
    });
    const warnings: Record<string, unknown>[] = [];
    const client = makeClient(0.5, warnings);
    const result = await client.chat({ channel: "home", userText: "ci sei?" });

    expect(result.degraded).toBe(true);
    expect(result.text).toBe(DEGRADED_REPLY);
    expect(stub.requests).toHaveLength(0); // provider never reached
    expect(warnings.length).toBeGreaterThan(0);
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1); // no new ledger row for degraded replies
  });

  it("counts only today's spend toward the budget", async () => {
    await db.insert(budgetLedger).values({
      date: "2020-01-01",
      provider: "anthropic",
      model: MODEL,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: "99.000000",
    });
    const client = makeClient(0.5);
    const result = await client.chat({ channel: "home", userText: "ci sei?" });
    expect(result.degraded).toBe(false);
    expect(stub.requests).toHaveLength(1);
  });

  it("writes no ledger row when the provider errors", async () => {
    stub.nextResponse = { status: 529 };
    const client = makeClient(0.5);
    await expect(client.chat({ channel: "home", userText: "ciao" })).rejects.toThrow(/529/);
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });
});
