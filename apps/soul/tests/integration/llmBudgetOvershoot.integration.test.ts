import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { accounts, budgetLedger, createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { DEFAULT_CHAT_MODEL, LlmClient, type LlmChatResult } from "@ugo/memory";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";

/**
 * Cosa succede al tetto quando le chiamate arrivano insieme (regola 3), su
 * OpenRouter vero (regola 1). Si parte con la casa a UN soffio dal tetto
 * (manca un milionesimo di dollaro): qualunque chiamata vera lo supera, quindi
 * il numero di chiamate che PASSANO è esattamente lo sforamento.
 *
 *  - stessa corsia: la coda serializza, passa UNA chiamata, le altre sono degradate;
 *  - due corsie (chat + sfondo): ognuna ha la sua coda, ne possono passare DUE,
 *    una per corsia — il limite dichiarato in STATE. Mai di più.
 *
 * Prova il limite APPLICATIVO sul costo già registrato: non dice nulla sulla
 * fatturazione del fornitore. Richiede OPENROUTER_API_KEY; spende frazioni di centesimo.
 */
const apiKey = process.env.OPENROUTER_API_KEY ?? "";
if (apiKey === "") throw new Error("OPENROUTER_API_KEY è obbligatoria: questo test parla col fornitore vero");

const TZ = "Europe/Rome";
const CEILING = 0.01;
const SEEDED = 0.009999; // manca 0,000001 al tetto

let container: StartedPostgreSqlContainer;
let db: DbClient;

interface House {
  accountId: string;
  gosinoId: string;
}

async function houseNearCeiling(slug: string): Promise<House> {
  const house = await createAccountWithFounder(db, randomBytes(32), { slug, name: slug, gosinoName: "Ugo" });
  await db.update(accounts).set({ dailyBudgetUsd: CEILING.toFixed(4) }).where(eq(accounts.id, house.accountId));
  await db.insert(budgetLedger).values({
    accountId: house.accountId,
    gosinoId: house.gosinoId,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()),
    provider: "openrouter",
    model: "seed",
    tokensIn: 0,
    tokensOut: 0,
    costUsd: SEEDED.toFixed(6),
  });
  return { accountId: house.accountId, gosinoId: house.gosinoId };
}

const clientFor = (house: House, lane?: "chat" | "background"): LlmClient =>
  new LlmClient({
    db,
    apiKey,
    model: DEFAULT_CHAT_MODEL,
    dailyBudgetUsd: 99,
    accountId: house.accountId,
    gosinoId: house.gosinoId,
    timezone: TZ,
    timeoutMs: 90_000,
    ...(lane !== undefined && { lane }),
  });

const chat = (house: House, lane?: "chat" | "background"): Promise<LlmChatResult> =>
  clientFor(house, lane).chat({ channel: "home", userText: "Rispondi solo: ok." });
const background = (house: House): Promise<LlmChatResult> =>
  clientFor(house, "background").generate("Rispondi solo: ok.", 20, 0);

/** quante righe vere (non il seme) ha scritto la casa, e quanto ha speso oltre il seme */
async function realSpend(house: House): Promise<{ rows: number; overshoot: number }> {
  const [row] = await db
    .select({ rows: sql<number>`count(*) filter (where ${budgetLedger.model} <> 'seed')::int`, total: sql<string>`sum(${budgetLedger.costUsd})` })
    .from(budgetLedger)
    .where(eq(budgetLedger.accountId, house.accountId));
  return { rows: row?.rows ?? 0, overshoot: Number(row?.total ?? 0) - CEILING };
}

const passed = (results: LlmChatResult[]): number => results.filter((r) => !r.degraded).length;

beforeAll(async () => {
  const started = await startPostgres();
  container = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("il tetto con chiamate concorrenti, sul fornitore vero", () => {
  it("stessa corsia: con cinque chiamate insieme ne passa UNA, le altre sono degradate", async () => {
    const house = await houseNearCeiling("tetto-una-corsia");
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => chat(house)));
    const real = await realSpend(house);
    console.log(`una corsia: passate ${String(passed(results))}/5, righe vere ${String(real.rows)}, sforamento ${real.overshoot.toFixed(6)} USD`);

    expect(passed(results)).toBe(1);
    expect(real.rows).toBe(1);
    expect(real.overshoot).toBeGreaterThan(0); // la chiamata che è passata ha superato il tetto: è il limite dichiarato
  }, 180_000);

  it("due corsie (chat + sfondo): ne passano al massimo DUE, una per corsia", async () => {
    const house = await houseNearCeiling("tetto-due-corsie");
    const results = await Promise.all([
      ...[1, 2, 3, 4].map(() => chat(house)),
      ...[1, 2, 3, 4].map(() => background(house)),
    ]);
    const real = await realSpend(house);
    console.log(`due corsie: passate ${String(passed(results))}/8, righe vere ${String(real.rows)}, sforamento ${real.overshoot.toFixed(6)} USD`);

    expect(passed(results)).toBeGreaterThanOrEqual(1);
    expect(passed(results)).toBeLessThanOrEqual(2);
    expect(real.rows).toBe(passed(results)); // ogni chiamata passata ha la sua riga: nessuna spesa persa
  }, 180_000);

  it("la casa a tetto già superato non lascia passare nessuna chiamata, in nessuna corsia", async () => {
    const house = await houseNearCeiling("tetto-superato");
    await chat(house); // supera il tetto
    const before = (await realSpend(house)).rows;
    const results = await Promise.all([chat(house), chat(house), background(house), background(house)]);

    expect(passed(results)).toBe(0);
    expect((await realSpend(house)).rows).toBe(before);
  }, 180_000);
});
