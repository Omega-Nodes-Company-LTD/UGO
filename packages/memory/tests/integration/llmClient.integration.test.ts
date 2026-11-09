import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  PRIME_GOSINO_ID,
  PRIME_ACCOUNT_ID,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CHAT_MODEL } from "../../src/chatRequest.js";
import { DEGRADED_REPLY, LlmClient } from "../../src/llmClient.js";

// Real Postgres ledger + real OpenRouter (ADR-125: no stubs). Costs a fraction
// of a cent per run; the key comes from the environment and is mandatory.

const API_KEY = process.env.OPENROUTER_API_KEY;
if (API_KEY === undefined || API_KEY === "") {
  throw new Error("OPENROUTER_API_KEY is required: these tests call the real provider (ADR-125)");
}
const TZ = "Europe/Rome";

let pg: StartedPostgreSqlContainer;
let db: DbClient;

const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

function makeClient(
  dailyBudgetUsd: number,
  warnSink?: Record<string, unknown>[],
  model: string = DEFAULT_CHAT_MODEL,
): LlmClient {
  return new LlmClient({
    db,
    apiKey: API_KEY ?? "",
    model,
    dailyBudgetUsd,
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
});

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

afterEach(async () => {
  await db.delete(budgetLedger);
});

describe("a real answer from OpenRouter", () => {
  it("answers in words, not an empty reasoning trace", async () => {
    const client = makeClient(0.5);
    const result = await client.chat({ channel: "home", userText: "Ciao UGO, come stai?" });
    expect(result.degraded).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("records the call with the cost OpenRouter declares", async () => {
    const client = makeClient(0.5);
    const result = await client.chat({ channel: "home", userText: "Dimmi una parola gentile." });

    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
    expect(rows[0]?.model).toBe(DEFAULT_CHAT_MODEL);
    expect(rows[0]?.date).toBe(today());
    expect(rows[0]?.tokensIn).toBeGreaterThan(0);
    expect(rows[0]?.tokensOut).toBeGreaterThan(0);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(Number(rows[0]?.costUsd)).toBeCloseTo(result.costUsd ?? 0, 6);
  });

  it("reads the fixed prefix from the cache on the second call (rule 2)", async () => {
    const client = makeClient(0.5);
    await client.chat({ channel: "home", dynamicSystem: "Stato: sereno.", userText: "prima" });
    const second = await client.chat({
      channel: "home",
      dynamicSystem: "Stato: allegro. Ricordi: il gatto si chiama Bruno.",
      userText: "seconda",
    });
    expect(second.usage?.cacheReadInputTokens ?? 0).toBeGreaterThan(0);
  });
});

describe("the piggy bank (budget_ledger)", () => {
  it("degrades with the declared reply once the daily budget is spent", async () => {
    await db.insert(budgetLedger).values({
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      date: today(),
      provider: "openrouter",
      model: DEFAULT_CHAT_MODEL,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: "0.600000",
    });
    const warnings: Record<string, unknown>[] = [];
    const client = makeClient(0.5, warnings);
    const result = await client.chat({ channel: "home", userText: "ci sei?" });

    expect(result.degraded).toBe(true);
    expect(result.text).toBe(DEGRADED_REPLY);
    expect(warnings.length).toBeGreaterThan(0);
    // a reached provider writes a row: one row means it was never called
    expect(await db.select().from(budgetLedger)).toHaveLength(1);
  });

  it("counts only today's spend toward the budget", async () => {
    await db.insert(budgetLedger).values({
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      date: "2020-01-01",
      provider: "openrouter",
      model: DEFAULT_CHAT_MODEL,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: "99.000000",
    });
    const client = makeClient(0.5);
    const result = await client.chat({ channel: "home", userText: "ci sei?" });
    expect(result.degraded).toBe(false);
    expect(await db.select().from(budgetLedger)).toHaveLength(2);
  });

  it("writes no ledger row when the provider refuses the request", async () => {
    const client = makeClient(0.5, undefined, "ugo/this-model-does-not-exist");
    await expect(client.chat({ channel: "home", userText: "ciao" })).rejects.toThrow(
      /LLM provider error \(status 4\d\d\)/,
    );
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });
});
