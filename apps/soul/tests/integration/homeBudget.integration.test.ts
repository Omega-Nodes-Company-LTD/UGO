import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { accounts, budgetLedger, createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { DEGRADED_REPLY, LlmClient, readUsage, recordSpend } from "@ugo/memory";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";

/**
 * Il tetto giornaliero scelto nel /setup (ADR-132) è DAVVERO un tetto: vive su
 * `accounts.daily_budget_usd`, sopravvive a una connessione nuova, e a tetto
 * raggiunto la chiamata non parte (nessuna rete: la risposta è quella
 * degradata). È un limite APPLICATIVO sul costo già registrato — qui non si
 * prova (né si promette) che il fornitore non possa fatturare di più.
 */
let container: StartedPostgreSqlContainer;
let url: string;
let db: DbClient;
let accountId: string;
let gosinoId: string;

const TZ = "Europe/Rome";
const DAY = new Date("2026-11-23T12:00:00Z");
const NEXT_DAY = new Date("2026-11-24T12:00:00Z");

const client = (conn: DbClient): LlmClient =>
  new LlmClient({ db: conn, apiKey: "sk-or-v1-mai-usata", model: "deepseek/deepseek-v4-flash", dailyBudgetUsd: 99, accountId, gosinoId, timezone: TZ });

async function spend(cost: string, at: string): Promise<void> {
  await db.insert(budgetLedger).values({ accountId, gosinoId, date: at, provider: "openrouter", model: "m", tokensIn: 1, tokensOut: 1, costUsd: cost });
}

beforeAll(async () => {
  const started = await startPostgres();
  container = started.container;
  url = started.url;
  await runMigrations(url);
  db = createDbClient(url);
  const house = await createAccountWithFounder(db, randomBytes(32), { slug: "casa-tetto", name: "Tetto", gosinoName: "Ugo" });
  accountId = house.accountId;
  gosinoId = house.gosinoId;
  await db.update(accounts).set({ dailyBudgetUsd: "0.7500" }).where(eq(accounts.id, accountId));
}, 120_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("tetto giornaliero della casa locale", () => {
  it("sopravvive a una connessione nuova e vince sul valore di processo", async () => {
    const fresh = createDbClient(url);
    try {
      expect(await client(fresh).dailyBudgetUsd()).toBeCloseTo(0.75); // non 99
    } finally {
      await fresh.$client.end();
    }
  });

  it("sotto il tetto non frena; al tetto la chiamata non parte", async () => {
    const llm = client(db);
    await spend("0.700000", "2026-11-23");
    expect(await llm.spentTodayUsd(DAY)).toBeCloseTo(0.7);
    expect(await llm.spentTodayUsd(DAY)).toBeLessThan(await llm.dailyBudgetUsd());

    await spend("0.050000", "2026-11-23"); // 0,75 = tetto
    const reply = await llm.chat({ channel: "home", userText: "ciao" }, DAY); // se partisse, andrebbe in rete con una chiave finta
    expect(reply).toEqual({ text: DEGRADED_REPLY, degraded: true });
  });

  it("oltre il tetto resta degradata, anche con chiamate concorrenti", async () => {
    await spend("0.500000", "2026-11-23");
    const llm = client(db);
    const replies = await Promise.all([1, 2, 3, 4].map(() => client(db).chat({ channel: "home", userText: "x" }, DAY)));
    expect(replies.every((r) => r.degraded)).toBe(true);
    expect(await llm.spentTodayUsd(DAY)).toBeGreaterThan(await llm.dailyBudgetUsd());
  });

  it("il giorno dopo il conto riparte da zero (fuso della casa)", async () => {
    expect(await client(db).spentTodayUsd(NEXT_DAY)).toBe(0);
  });

  it("la spesa si segna anche se l'uso non è leggibile (riga a zero, dichiarata)", async () => {
    const before = (await db.select().from(budgetLedger)).length;
    const result = await recordSpend(db, { usage: "illeggibile" }, { accountId, gosinoId, date: "2026-11-24", model: "m" });
    expect(result.counted).toBe(false);
    expect(result.costUsd).toBe(0);
    expect((await db.select().from(budgetLedger)).length).toBe(before + 1);
    expect(readUsage(null).counted).toBe(false);
  });
});
