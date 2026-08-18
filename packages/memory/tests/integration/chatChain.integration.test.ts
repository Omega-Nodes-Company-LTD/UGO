import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  budgetLedger,
  createDbClient,
  type DbClient,
  feedings,
  PRIME_ACCOUNT_ID,
  PRIME_GOSINO_ID,
  runMigrations,
} from "@ugo/db";
import { LlmStub, startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatChain } from "../../src/chatChain.js";
import { DEGRADED_REPLY, HUNGRY_REPLY, LlmClient } from "../../src/llmClient.js";

/**
 * La catena a più anelli (ADR-095), sul giro vero: Ollama → OpenRouter →
 * Anthropic, e OGNI anello che risponde scrive la sua riga sul ledger col suo
 * listino. Quattro server veri: un Ollama finto, un OpenRouter finto (entrambi
 * HTTP davvero, catturano il body), lo stub Anthropic e Postgres.
 *
 * Le tre cose che contano:
 * 1. chi risponde PAGA — anche casa, a listino nominale: il metabolismo gira
 *    su ogni anello, non è più un'esenzione (supera ADR-094 §4 su direttiva);
 * 2. l'ordine è quello deciso, e un anello non configurato si salta;
 * 3. i muri stanno all'INGRESSO della catena: a tetto sfondato o salvadanaio
 *    vuoto non si sfiora NESSUN anello, nemmeno quello quasi gratis —
 *    altrimenti la fame sarebbe una finzione.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let anthropic: LlmStub;
let ollama: Server;
let ollamaUrl: string;
let openRouter: Server;
let openRouterUrl: string;
/** cosa i due finti devono fare al prossimo giro */
let ollamaPlan: { text?: string; status?: number; hang?: boolean };
let orPlan: { text?: string; status?: number; cost?: number };
/** l'ultimo body ricevuto, per guardare COSA arriva a ogni anello */
let ollamaSeen: { messages?: { role: string; content: string }[] } | undefined;
let orSeen:
  | { model?: string; messages?: { role: string; content: string }[]; usage?: { include?: boolean } }
  | undefined;
let orAuth: string | undefined;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  anthropic = new LlmStub();
  await anthropic.start();

  ollama = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      ollamaSeen = JSON.parse(body) as typeof ollamaSeen;
      if (ollamaPlan.hang === true) return; // niente risposta: il timeout deciderà
      res.statusCode = ollamaPlan.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          message: { content: ollamaPlan.text ?? "" },
          prompt_eval_count: 100,
          eval_count: 20,
        }),
      );
    });
  });
  await new Promise<void>((ready) => ollama.listen(0, "127.0.0.1", ready));
  ollamaUrl = `http://127.0.0.1:${String((ollama.address() as AddressInfo).port)}`;

  openRouter = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      orSeen = JSON.parse(body) as typeof orSeen;
      orAuth = req.headers.authorization;
      res.statusCode = orPlan.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content: orPlan.text ?? "" } }],
          usage: { prompt_tokens: 200, completion_tokens: 30, cost: orPlan.cost ?? 0.00123 },
        }),
      );
    });
  });
  await new Promise<void>((ready) => openRouter.listen(0, "127.0.0.1", ready));
  openRouterUrl = `http://127.0.0.1:${String((openRouter.address() as AddressInfo).port)}`;
}, 240_000);

afterAll(async () => {
  await new Promise((done) => ollama.close(done));
  await new Promise((done) => openRouter.close(done));
  await anthropic.close();
  await db.$client.end();
  await pg.stop();
});

const build = (withOpenRouter = true): ChatChain =>
  new ChatChain({
    db,
    accountId: PRIME_ACCOUNT_ID,
    gosinoId: PRIME_GOSINO_ID,
    timezone: "Europe/Rome",
    local: { baseUrl: ollamaUrl, model: "qwen-test", timeoutMs: 2_000 },
    ...(withOpenRouter && {
      openRouter: {
        baseUrl: openRouterUrl,
        apiKey: "or-test-key",
        model: "qwen/qwen-2.5-72b",
        timeoutMs: 2_000,
      },
    }),
    remote: new LlmClient({
      db,
      apiKey: "test-key",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 5,
      baseUrl: anthropic.baseUrl,
      timezone: "Europe/Rome",
    }),
  });

beforeEach(async () => {
  ollamaPlan = {};
  orPlan = {};
  ollamaSeen = undefined;
  orSeen = undefined;
  orAuth = undefined;
  anthropic.reset();
  await db.delete(budgetLedger);
  await db.delete(feedings);
  await db.update(accounts).set({ metabolism: false }).where(eq(accounts.id, PRIME_ACCOUNT_ID));
});

describe("chi risponde paga", () => {
  it("casa risponde: riga «ollama» a listino nominale, e nessun altro anello sfiorato", async () => {
    ollamaPlan = { text: "Grunf, sono la voce di casa." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("voce di casa");
    expect(result.degraded).toBe(false);

    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("ollama");
    expect(rows[0]?.model).toBe("qwen-test");
    expect(rows[0]?.tokensIn).toBe(100);
    expect(rows[0]?.tokensOut).toBe(20);
    // nominale ma NON zero: il metabolismo deve avere qualcosa da mangiare
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
    expect(Number(rows[0]?.costUsd)).toBeLessThan(0.0001);
    expect(orSeen).toBeUndefined();
    expect(anthropic.requests).toHaveLength(0);
  });

  it("e riceve il prompt VERO: identità, regole, ricordi e cronaca", async () => {
    ollamaPlan = { text: "ok" };
    await build().chat({
      channel: "home",
      dynamicSystem: "Ricordi pertinenti:\n- il corriere passa il martedì",
      history: [{ role: "assistant", content: "Grunf." }],
      userText: "quando passa il corriere?",
    });
    const system = ollamaSeen?.messages?.find((m) => m.role === "system")?.content ?? "";
    expect(system.length).toBeGreaterThan(100);
    expect(system).toContain("corriere passa il martedì");
    expect(ollamaSeen?.messages?.map((m) => m.role)).toEqual(["system", "assistant", "user"]);
  });

  it("casa giù: OpenRouter risponde e la riga porta il SUO costo dichiarato", async () => {
    ollamaPlan = { status: 500 };
    orPlan = { text: "Rispondo io, secondo anello.", cost: 0.00123 };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("secondo anello");

    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
    expect(rows[0]?.tokensIn).toBe(200);
    expect(rows[0]?.tokensOut).toBe(30);
    expect(Number(rows[0]?.costUsd)).toBeCloseTo(0.00123, 6);
    // la chiave viaggia come Bearer, e il conteggio è richiesto esplicitamente
    expect(orAuth).toBe("Bearer or-test-key");
    expect(orSeen?.usage?.include).toBe(true);
    expect(anthropic.requests).toHaveLength(0);
  });

  it("casa troppo lenta: il timeout decide e si passa al secondo anello", async () => {
    ollamaPlan = { hang: true };
    orPlan = { text: "Soccorso rapido." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toBe("Soccorso rapido.");
    const rows = await db.select().from(budgetLedger);
    expect(rows[0]?.provider).toBe("openrouter");
  });

  it("casa e OpenRouter giù: Anthropic risponde e paga come sempre", async () => {
    ollamaPlan = { status: 500 };
    orPlan = { status: 503 };
    anthropic.nextResponse = { text: "Rispondo io, dal soccorso." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("soccorso");
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("anthropic");
    expect(anthropic.requests).toHaveLength(1);
  });

  it("senza OpenRouter configurato la catena lo salta: casa giù → Anthropic", async () => {
    ollamaPlan = { status: 500 };
    anthropic.nextResponse = { text: "Soccorso diretto." };
    const result = await build(false).chat({ channel: "home", userText: "ciao" });
    expect(result.text).toBe("Soccorso diretto.");
    expect(orSeen).toBeUndefined();
  });
});

describe("i muri stanno all'ingresso della catena", () => {
  it("tetto di famiglia sfondato: degradazione SENZA sfiorare nessun anello", async () => {
    await db.insert(budgetLedger).values({
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date()),
      provider: "anthropic",
      model: "claude-haiku-4-5",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: "99.0",
    });
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(true);
    expect(result.text).toBe(DEGRADED_REPLY);
    expect(ollamaSeen).toBeUndefined();
    expect(orSeen).toBeUndefined();
    expect(anthropic.requests).toHaveLength(0);
  });

  it("salvadanaio vuoto col metabolismo acceso: la fame vale anche per la voce di casa", async () => {
    await db.update(accounts).set({ metabolism: true }).where(eq(accounts.id, PRIME_ACCOUNT_ID));
    ollamaPlan = { text: "non dovrei parlare" };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(true);
    expect(result.text).toBe(HUNGRY_REPLY);
    expect(ollamaSeen).toBeUndefined();
    expect(anthropic.requests).toHaveLength(0);
  });

  it("col salvadanaio pieno casa parla, e il pasto nominale viene scalato", async () => {
    await db.update(accounts).set({ metabolism: true }).where(eq(accounts.id, PRIME_ACCOUNT_ID));
    await db.insert(feedings).values({
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      kind: "lavoro",
      amountUsd: "1.00",
    });
    ollamaPlan = { text: "Grunf, pancia piena." };
    const chain = build();
    const result = await chain.chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("pancia piena");
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("ollama");
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
  });
});
