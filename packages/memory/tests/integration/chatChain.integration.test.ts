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
 * La catena a più anelli (ADR-095) nell'ordine di ADR-124, sul giro vero:
 * OpenRouter → casa (se accesa) → Anthropic, e OGNI anello che risponde
 * scrive la sua riga sul ledger col suo listino. Quattro server veri: un Ollama finto, un OpenRouter finto (entrambi
 * HTTP davvero, catturano il body), lo stub Anthropic e Postgres.
 *
 * Le tre cose che contano:
 * 1. chi risponde PAGA — anche casa, a listino nominale: il metabolismo gira
 *    su ogni anello, non è più un'esenzione (supera ADR-094 §4 su direttiva);
 * 2. l'ordine è quello deciso — **fuori prima**, perché casa senza GPU teneva
 *    la parola 30 secondi per frase — e un anello non configurato si salta
 *    senza essere sfiorato: assente non vuol dire «ha fallito»;
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

/**
 * Quali anelli ha questa casa. Di default tutti e due, perché i test che
 * guardano l'ORDINE hanno bisogno di entrambi; la configurazione che gira
 * davvero in produzione è `{ home: false }` (ADR-124), e ha il suo test.
 */
const build = ({ openRouter = true, home = true } = {}): ChatChain =>
  new ChatChain({
    db,
    accountId: PRIME_ACCOUNT_ID,
    gosinoId: PRIME_GOSINO_ID,
    timezone: "Europe/Rome",
    ...(home && { local: { baseUrl: ollamaUrl, model: "qwen-test", timeoutMs: 2_000 } }),
    ...(openRouter && {
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
  it("fuori prima: OpenRouter parla, e casa non viene sfiorata", async () => {
    ollamaPlan = { text: "non è il mio turno" };
    orPlan = { text: "Primo anello, fuori casa.", cost: 0.00077 };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("Primo anello");
    // non «ha fallito»: non gli è stato chiesto niente
    expect(ollamaSeen).toBeUndefined();
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
    expect(anthropic.requests).toHaveLength(0);
  });

  it("casa risponde (senza OpenRouter): riga «ollama» a listino nominale", async () => {
    ollamaPlan = { text: "Grunf, sono la voce di casa." };
    const result = await build({ openRouter: false }).chat({ channel: "home", userText: "ciao" });
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
    await build({ openRouter: false }).chat({
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

  it("la riga di OpenRouter porta il SUO costo dichiarato, non un listino nostro", async () => {
    orPlan = { text: "Rispondo io, primo anello.", cost: 0.00123 };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("primo anello");

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

  it("casa accesa ma muta: il timeout la taglia fuori e risponde il soccorso", async () => {
    // è il guasto del campo in laboratorio: l'anello di casa che non risponde.
    // Con un tetto da conversazione il silenzio finisce, e finisce dicendo
    // qualcosa — prima durava 30 secondi e poi altri 30.
    orPlan = { status: 503 };
    ollamaPlan = { hang: true };
    anthropic.nextResponse = { text: "Arrivo io." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toBe("Arrivo io.");
    const rows = await db.select().from(budgetLedger);
    expect(rows[0]?.provider).toBe("anthropic");
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
    const result = await build({ openRouter: false }).chat({
      channel: "home",
      userText: "ciao",
    });
    expect(result.text).toBe("Soccorso diretto.");
    expect(orSeen).toBeUndefined();
  });

  /**
   * La configurazione che gira in produzione da ADR-124: la voce di casa
   * spenta in attesa della GPU. L'anello **non esiste** — e la differenza fra
   * «non esiste» e «ha fallito» qui sono i secondi di silenzio che hanno fatto
   * nascere l'ADR.
   */
  it("voce di casa spenta: Ollama non viene sfiorato nemmeno quando tutto il resto cade", async () => {
    orPlan = { status: 503 };
    ollamaPlan = { text: "non dovrei nemmeno essere interpellato" };
    anthropic.nextResponse = { text: "Ci sono io." };
    const result = await build({ home: false }).chat({ channel: "home", userText: "ciao" });
    expect(result.text).toBe("Ci sono io.");
    expect(ollamaSeen).toBeUndefined();
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("anthropic");
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
    const chain = build({ openRouter: false });
    const result = await chain.chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("pancia piena");
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("ollama");
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
  });
});
