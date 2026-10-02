import {
  budgetLedger,
  createDbClient,
  creditLedger,
  PRIME_ACCOUNT_ID,
  PRIME_GOSINO_ID,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import {
  BAD_KEY,
  startLlmStub,
  startPostgres,
  type LlmStub,
  type PostgresHandle,
} from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { creditBalanceMicros } from "../../src/wallet.js";
import { CREDIT_REPLY, INVALID_KEY_REPLY, LlmClient } from "../../src/llmClient.js";
import { AnthropicAdapter } from "../../src/providers/anthropic.js";
import { ModelCatalog } from "../../src/providers/catalog.js";
import { OpenRouterAdapter } from "../../src/providers/openrouter.js";
import { verifyKey } from "../../src/providers/validate.js";
import { GatedText } from "../../src/text.js";

/**
 * ADR-122 / ADR-130 contro un Postgres vero e uno stub di rete vero
 * (TESTING_PLAYBOOK §3 P2): ogni adapter fa una richiesta HTTP reale, il
 * cancello scrive righe reali, e le asserzioni rileggono il database.
 */

const TZ = "Europe/Rome";
let pg: PostgresHandle;
let db: DbClient;
let stub: LlmStub;

beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  stub = await startLlmStub();
});

afterAll(async () => {
  await db.$client.end();
  await pg.container.stop();
  await stub.close();
});

afterEach(async () => {
  await db.delete(creditLedger);
  await db.delete(budgetLedger);
  stub.reset();
});

const openRouter = (model: string, apiKey = "or-key"): OpenRouterAdapter =>
  new OpenRouterAdapter({ apiKey, model, baseUrl: stub.baseUrl });
const anthropic = (model: string, apiKey = "an-key"): AnthropicAdapter =>
  new AnthropicAdapter({ apiKey, model, baseUrl: stub.baseUrl });

const client = (adapter: OpenRouterAdapter | AnthropicAdapter, extra = {}): LlmClient =>
  new LlmClient({ db, adapter, dailyBudgetUsd: 5, timezone: TZ, ...extra });

describe("OpenRouter adapter", () => {
  it("records the cost OpenRouter declares, and says so", async () => {
    stub.nextResponse = { cost: 0.0042, text: "Ciao dal router." };
    const result = await client(openRouter("mistralai/mistral-small")).chat({
      channel: "home",
      userText: "ciao",
    });
    expect(result.text).toBe("Ciao dal router.");
    const [row] = await db.select().from(budgetLedger);
    expect(row?.provider).toBe("openrouter");
    expect(Number(row?.costUsd)).toBeCloseTo(0.0042, 6);
    expect(row?.costSource).toBe("provider");
    expect(stub.completions[0]?.body.usage).toEqual({ include: true });
  });

  it("keeps the cached blocks as marked parts for anthropic/* models", async () => {
    await client(openRouter("anthropic/claude-haiku-4.5")).chat({
      channel: "home",
      dynamicSystem: "Stato: sereno.",
      userText: "ciao",
    });
    const system = stub.completions[0]?.body.messages[0] as {
      role: string;
      content: { text: string; cache_control?: unknown }[];
    };
    expect(system.role).toBe("system");
    expect(system.content.map((p) => p.cache_control !== undefined)).toEqual([true, true, false]);
  });

  it("concatenates the blocks for models without a cache to protect", async () => {
    await client(openRouter("mistralai/mistral-small")).chat({ channel: "home", userText: "x" });
    const system = stub.completions[0]?.body.messages[0] as { content: unknown };
    expect(typeof system.content).toBe("string");
  });
});

describe("the bill never throws (ADR-122 §3)", () => {
  it("prices an unknown Anthropic model at the most expensive tier, declared", async () => {
    const result = await client(anthropic("claude-mai-visto-1")).chat({
      channel: "home",
      userText: "ciao",
    });
    expect(result.degraded).toBe(false);
    const [row] = await db.select().from(budgetLedger);
    expect(row?.costSource).toBe("fallback");
    expect(Number(row?.costUsd)).toBeGreaterThan(0);
  });
});

describe("models that think by default", () => {
  it("lowers the effort and widens max_tokens on a model that cannot stop thinking", async () => {
    await client(anthropic("claude-opus-5-5")).chat({ channel: "home", userText: "ciao" });
    const body = stub.completions[0]?.body;
    expect(body?.output_config).toEqual({ effort: "low" });
    expect(body?.max_tokens).toBeGreaterThan(200);
    expect(body?.thinking).toBeUndefined();
  });

  it("turns thinking off the Sonnet 5.5 way, and sends no temperature it would refuse", async () => {
    const text = new GatedText({
      db,
      adapter: anthropic("claude-sonnet-5-5"),
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      timezone: TZ,
      dailyBudgetUsd: 5,
      keySource: "byok",
    });
    expect(await text.generate("pensa", 50, { temperature: 0 })).toBe("Grunf, ricevuto.");
    const body = stub.completions[0]?.body;
    expect(body?.thinking).toEqual({ type: "between_tools" });
    expect(body?.temperature).toBeUndefined();
  });

  it("reads only the text blocks of a reply that also carries thinking", async () => {
    stub.nextResponse = { text: "Solo questo." };
    const result = await client(anthropic("claude-haiku-4-5")).chat({
      channel: "home",
      userText: "ciao",
    });
    expect(result.text).toBe("Solo questo.");
  });
});

describe("a key the provider refuses", () => {
  it("answers in Italian, tells the owner, and writes no ledger row", async () => {
    let told = 0;
    const result = await client(anthropic("claude-haiku-4-5", BAD_KEY), {
      onAuthFailure: () => {
        told += 1;
      },
    }).chat({ channel: "home", userText: "ciao" });
    expect(result).toMatchObject({ text: INVALID_KEY_REPLY, degraded: true });
    expect(told).toBe(1);
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("is told apart from a good one before it is saved", async () => {
    const urls = { anthropic: stub.baseUrl, openrouter: stub.baseUrl, elevenlabs: stub.baseUrl };
    expect(await verifyKey("anthropic", "buona", urls)).toBe("ok");
    expect(await verifyKey("openrouter", BAD_KEY, urls)).toBe("invalid");
    expect(await verifyKey("elevenlabs", "buona", urls)).toBe("ok");
    expect(await verifyKey("openai", "buona", { openai: "http://127.0.0.1:9" })).toBe("unreachable");
  });
});

describe("UGO keys on credit (ADR-130)", () => {
  const terms = { markup: 1.5, usdToEur: 0.9 };

  it("does not reach the provider with no credit", async () => {
    const result = await client(anthropic("claude-haiku-4-5"), {
      keySource: "ugo",
      credit: terms,
    }).chat({ channel: "home", userText: "ciao" });
    expect(result).toMatchObject({ text: CREDIT_REPLY, degraded: true });
    expect(stub.completions).toHaveLength(0);
  });

  it("debits cost × markup in micro-euro, tied to the ledger row", async () => {
    await db.insert(creditLedger).values({
      accountId: PRIME_ACCOUNT_ID,
      kind: "topup",
      amountMicros: 10_000_000,
      ref: "test:topup",
    });
    stub.nextResponse = { cost: 0.01 };
    await client(openRouter("mistralai/mistral-small"), {
      keySource: "ugo",
      credit: terms,
    }).chat({ channel: "home", userText: "ciao" });

    const [ledger] = await db.select().from(budgetLedger);
    expect(ledger?.keySource).toBe("ugo");
    const [usage] = await db.select().from(creditLedger).where(eq(creditLedger.kind, "usage"));
    expect(usage?.amountMicros).toBe(-13_500);
    expect(usage?.ref).toBe(`ledger:${ledger?.id ?? ""}`);
    expect(await creditBalanceMicros(db, PRIME_ACCOUNT_ID)).toBe(10_000_000 - 13_500);
  });

  it("refuses a usage row that would add credit (the sign check)", async () => {
    await expect(
      db.insert(creditLedger).values({
        accountId: PRIME_ACCOUNT_ID,
        kind: "usage",
        amountMicros: 5,
      }),
    ).rejects.toThrow();
  });
});

describe("one queue per account, whatever the client", () => {
  it("keeps the daily ceiling when chat and thought race", async () => {
    stub.nextResponse = { cost: 0.6 };
    const make = (): LlmClient => client(openRouter("mistralai/mistral-small"), { dailyBudgetUsd: 1 });
    // two different clients, same account: before ADR-122 each had its own queue
    const results = await Promise.all([
      make().chat({ channel: "home", userText: "uno" }),
      make().chat({ channel: "home", userText: "due" }),
      make().chat({ channel: "home", userText: "tre" }),
    ]);
    // 0.6 + 0.6 crosses 1: the third reads the ledger after the second wrote it
    expect(results.filter((r) => r.degraded)).toHaveLength(1);
    expect(stub.completions).toHaveLength(2);
  });
});

describe("the catalog the house chooses from", () => {
  it("lists OpenRouter models with prices per MTok and vision", async () => {
    const models = await new ModelCatalog({ openRouterBaseUrl: stub.baseUrl }).openRouter();
    const haiku = models.find((m) => m.id === "anthropic/claude-haiku-4.5");
    expect(haiku).toMatchObject({ inputPerMTok: 1, outputPerMTok: 5, vision: true });
    expect(models.find((m) => m.id === "mistralai/mistral-small")?.vision).toBe(false);
  });

  it("offers only the Anthropic models we can price", async () => {
    const models = await new ModelCatalog({ anthropicBaseUrl: stub.baseUrl }).anthropic("k", "h");
    expect(models.map((m) => m.id).sort()).toEqual(["claude-haiku-4-5", "claude-sonnet-5-5"]);
  });
});
