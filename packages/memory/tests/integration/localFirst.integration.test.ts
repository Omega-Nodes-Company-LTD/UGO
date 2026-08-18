import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, type DbClient, PRIME_ACCOUNT_ID, PRIME_GOSINO_ID, runMigrations } from "@ugo/db";
import { LlmStub, startPostgres } from "@ugo/factories";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LlmClient } from "../../src/llmClient.js";
import { LocalFirstLlm } from "../../src/localFirst.js";

/**
 * La voce di casa parla per prima (ADR-094), sul giro vero.
 *
 * Tre server veri: un Ollama finto ma HTTP davvero (cattura il body, così si
 * guarda COSA riceve), lo stub del provider (lo stesso di tutti i test del
 * budget guard) e Postgres per il ledger. Le tre cose che contano:
 *
 * 1. quando casa risponde, il provider **non viene sfiorato** e il ledger
 *    resta vuoto — la risposta non costa e i conti lo dicono;
 * 2. quando casa è giù, il soccorso remoto risponde e **paga come sempre**:
 *    il budget guard non si aggira ripiegando;
 * 3. il locale riceve il PROMPT VERO — identità, regole, psiche+ricordi,
 *    cronaca — non una domanda nuda: la voce cambia, la testa no.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let provider: LlmStub;
let ollama: Server;
let ollamaUrl: string;
/** cosa il finto Ollama deve fare al prossimo giro */
let plan: { text?: string; status?: number; hang?: boolean };
/** l'ultimo body ricevuto dal finto Ollama */
let seen: { messages?: { role: string; content: string }[] } = {};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  provider = new LlmStub();
  await provider.start();

  ollama = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      seen = JSON.parse(body) as typeof seen;
      if (plan.hang === true) return; // niente risposta: il timeout deciderà
      res.statusCode = plan.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: { content: plan.text ?? "" } }));
    });
  });
  await new Promise<void>((ready) => ollama.listen(0, "127.0.0.1", ready));
  ollamaUrl = `http://127.0.0.1:${String((ollama.address() as AddressInfo).port)}`;
}, 240_000);

afterAll(async () => {
  await new Promise((done) => ollama.close(done));
  await provider.close();
  await db.$client.end();
  await pg.stop();
});

const build = (timeoutMs = 2_000): LocalFirstLlm =>
  new LocalFirstLlm(
    new LlmClient({
      db,
      apiKey: "test-key",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 5,
      baseUrl: provider.baseUrl,
      timezone: "Europe/Rome",
    }),
    { baseUrl: ollamaUrl, model: "qwen-test", timeoutMs },
  );

beforeEach(async () => {
  plan = {};
  seen = {};
  provider.reset();
  await db.delete(budgetLedger);
});

describe("quando casa risponde", () => {
  it("il provider non viene sfiorato, e il ledger resta vuoto", async () => {
    plan = { text: "Grunf, sono la voce di casa." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("voce di casa");
    expect(result.costUsd).toBe(0);
    expect(result.degraded).toBe(false);
    // il punto: nessuna chiamata al provider, nessuna riga sui conti
    expect(provider.requests).toHaveLength(0);
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("e riceve il prompt VERO: identità, regole, ricordi e cronaca", async () => {
    plan = { text: "ok" };
    await build().chat({
      channel: "home",
      dynamicSystem: "Ricordi pertinenti:\n- il corriere passa il martedì",
      history: [{ role: "assistant", content: "Grunf." }],
      userText: "quando passa il corriere?",
    });
    const system = seen.messages?.find((m) => m.role === "system")?.content ?? "";
    // l'identità e le regole della casa, le stesse del provider
    expect(system.length).toBeGreaterThan(100);
    expect(system).toContain("corriere passa il martedì");
    expect(seen.messages?.map((m) => m.role)).toEqual(["system", "assistant", "user"]);
  });
});

describe("quando casa non risponde", () => {
  it("giù del tutto: il soccorso remoto risponde e PAGA come sempre", async () => {
    plan = { status: 500 };
    provider.nextResponse = { text: "Rispondo io, dal soccorso." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toContain("soccorso");
    // il budget guard non si aggira ripiegando: la riga sul ledger c'è
    expect(provider.requests).toHaveLength(1);
    expect(await db.select().from(budgetLedger)).toHaveLength(1);
  });

  it("risposta vuota: vale come un silenzio, e si passa al soccorso", async () => {
    plan = { text: "   " };
    provider.nextResponse = { text: "Soccorso." };
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.text).toBe("Soccorso.");
  });

  it("troppo lenta: la chat non aspetta, e il timeout decide", async () => {
    plan = { hang: true };
    provider.nextResponse = { text: "Soccorso rapido." };
    const result = await build(300).chat({ channel: "home", userText: "ciao" });
    expect(result.text).toBe("Soccorso rapido.");
  });

  it("e il muro del budget resta sul ramo che spende", async () => {
    plan = { status: 500 };
    // il tetto è già speso: il soccorso deve DEGRADARE, non pagare
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
    expect(provider.requests).toHaveLength(0);
  });
});
