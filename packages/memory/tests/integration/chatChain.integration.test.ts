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
import { startOllama, startPostgres, TEXT_MODEL, type OllamaHandle } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatChain } from "../../src/chatChain.js";
import { DEFAULT_CHAT_MODEL } from "../../src/chatRequest.js";
import { DEGRADED_REPLY, HUNGRY_REPLY, LlmClient } from "../../src/llmClient.js";

/**
 * La catena di ADR-125, sul giro vero: OpenRouter vero, Postgres vero, e un
 * Ollama vero quando serve che la voce di casa parli. Niente server finti.
 *
 * Le tre cose che contano:
 * 1. OpenRouter risponde per primo, e quando risponde la voce di casa non
 *    scrive niente;
 * 2. quando OpenRouter non risponde, la voce di casa fa da soccorso e paga a
 *    listino nominale; se tace anche lei, risale l'errore vero;
 * 3. i muri (tetto, salvadanaio) si leggono PRIMA di qualunque chiamata.
 */

const API_KEY = process.env.OPENROUTER_API_KEY;
if (API_KEY === undefined || API_KEY === "") {
  throw new Error("OPENROUTER_API_KEY is required: these tests call the real provider (ADR-125)");
}
/** nessuno ascolta qui: la voce di casa «giù», per davvero */
const SILENT_HOME = "http://127.0.0.1:9";
/** un modello che OpenRouter rifiuta con un 4xx vero: «OpenRouter non risponde» */
const REFUSED_MODEL = "ugo/this-model-does-not-exist";

let pg: StartedPostgreSqlContainer;
let db: DbClient;

const today = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

function build(options: { homeUrl?: string; model?: string } = {}): ChatChain {
  return new ChatChain({
    db,
    timezone: "Europe/Rome",
    local: { baseUrl: options.homeUrl ?? SILENT_HOME, model: TEXT_MODEL, timeoutMs: 60_000 },
    remote: new LlmClient({
      db,
      apiKey: API_KEY ?? "",
      model: options.model ?? DEFAULT_CHAT_MODEL,
      dailyBudgetUsd: 5,
      timezone: "Europe/Rome",
    }),
  });
}

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
});

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

beforeEach(async () => {
  await db.delete(budgetLedger);
  await db.delete(feedings);
  await db.update(accounts).set({ metabolism: false }).where(eq(accounts.id, PRIME_ACCOUNT_ID));
});

describe("OpenRouter prima", () => {
  it("risponde OpenRouter, e la voce di casa non scrive niente", async () => {
    const result = await build().chat({ channel: "home", userText: "Ciao, come stai?" });
    expect(result.degraded).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);
    const rows = await db.select().from(budgetLedger);
    expect(rows.map((row) => row.provider)).toEqual(["openrouter"]);
  });

  it("OpenRouter rifiuta e la voce di casa è giù: risale l'errore vero, nessuna riga", async () => {
    await expect(
      build({ model: REFUSED_MODEL }).chat({ channel: "home", userText: "ciao" }),
    ).rejects.toThrow(/LLM provider error \(status 4\d\d\)/);
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });
});

describe("la voce di casa come soccorso (Ollama vero)", () => {
  let home: OllamaHandle | undefined;

  beforeAll(async () => {
    home = await startOllama({ models: [TEXT_MODEL] });
  });

  afterAll(async () => {
    await home?.container.stop();
  });

  it("OpenRouter rifiuta: parla casa, e paga a listino nominale", async () => {
    const result = await build({ homeUrl: home?.baseUrl ?? SILENT_HOME, model: REFUSED_MODEL }).chat({
      channel: "home",
      userText: "Ciao, dimmi una parola.",
    });
    expect(result.degraded).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("ollama");
    expect(rows[0]?.model).toBe(TEXT_MODEL);
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
  });
});

describe("i muri stanno all'ingresso", () => {
  it("tetto di famiglia sfondato: degradazione senza chiamare nessuno", async () => {
    await db.insert(budgetLedger).values({
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      date: today(),
      provider: "openrouter",
      model: DEFAULT_CHAT_MODEL,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: "99.0",
    });
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(true);
    expect(result.text).toBe(DEGRADED_REPLY);
    // chi viene chiamato scrive una riga: una sola vuol dire nessuno
    expect(await db.select().from(budgetLedger)).toHaveLength(1);
  });

  it("salvadanaio vuoto col metabolismo acceso: ha fame, e nessuno parla", async () => {
    await db.update(accounts).set({ metabolism: true }).where(eq(accounts.id, PRIME_ACCOUNT_ID));
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(true);
    expect(result.text).toBe(HUNGRY_REPLY);
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("col salvadanaio pieno parla, e il pasto viene scalato col costo vero", async () => {
    await db.update(accounts).set({ metabolism: true }).where(eq(accounts.id, PRIME_ACCOUNT_ID));
    await db.insert(feedings).values({
      accountId: PRIME_ACCOUNT_ID,
      gosinoId: PRIME_GOSINO_ID,
      kind: "lavoro",
      amountUsd: "1.00",
    });
    const result = await build().chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(false);
    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
  });
});
