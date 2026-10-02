import { accounts, budgetLedger, creditLedger, feedings, type DbClient } from "@ugo/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * I lettori del portafoglio della casa: quanto ha speso oggi, quanto può
 * spendere, quanto ha nel salvadanaio e nel credito. Sempre dal database, mai
 * stimati. Li usa il cancello (`gate.ts`) e li mostra il pannello.
 */

export interface CreditTerms {
  /** ricarico sul costo reale delle chiavi UGO (es. 1.3 = +30%) */
  markup: number;
  /** cambio usato per scalare il credito, che è in euro */
  usdToEur: number;
}

export function localDate(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

/** La spesa di OGGI della casa, sempre dal database, mai stimata. */
export async function spentTodayUsd(
  db: DbClient,
  accountId: string,
  timezone: string,
  at: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
    .from(budgetLedger)
    .where(and(eq(budgetLedger.accountId, accountId), eq(budgetLedger.date, localDate(timezone, at))));
  return Number(rows[0]?.total ?? 0);
}

/** Il tetto della casa se ne ha uno, quello di processo altrimenti. */
export async function dailyBudgetUsd(
  db: DbClient,
  accountId: string,
  fallback: number,
): Promise<number> {
  const [row] = await db
    .select({ limit: accounts.dailyBudgetUsd })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  const own = row?.limit;
  return own === null || own === undefined ? fallback : Number(own);
}

/**
 * Il salvadanaio dell'esemplare (ADR-072): dato meno consumato, da sempre.
 * `undefined` quando la casa non ha il metabolismo acceso.
 */
export async function piggyBankUsd(
  db: DbClient,
  accountId: string,
  gosinoId: string,
): Promise<number | undefined> {
  const [house] = await db
    .select({ on: accounts.metabolism })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (house?.on !== true) return undefined;
  const [fed] = await db
    .select({ total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
    .from(feedings)
    .where(eq(feedings.gosinoId, gosinoId));
  const [eaten] = await db
    .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
    .from(budgetLedger)
    .where(eq(budgetLedger.gosinoId, gosinoId));
  return Number(fed?.total ?? 0) - Number(eaten?.total ?? 0);
}

/** Il saldo del credito in micro-euro (ADR-130): la somma del registro. */
export async function creditBalanceMicros(db: DbClient, accountId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${creditLedger.amountMicros}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.accountId, accountId));
  return Number(row?.total ?? 0);
}

/**
 * Quanto scala dal credito una spesa in dollari: per eccesso, ma non per il
 * rumore della virgola mobile (0,01 × 0,9 × 1,5 × 1e6 fa 13500,000000000002,
 * e un `ceil` nudo addebiterebbe un micro-euro che nessuno ha speso).
 */
export function creditDebitMicros(costUsd: number, terms: CreditTerms): number {
  const exact = costUsd * terms.usdToEur * terms.markup * 1e6;
  return Math.ceil(exact - 1e-6);
}
