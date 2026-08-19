import { customerMessages, customers, type DbClient } from "@ugo/db";
import { and, eq, gt, sql } from "drizzle-orm";

/**
 * The customer's counter (ADR-055): the two outer walls, always computed
 * server-side from Postgres — a counter that resets on restart is a counter
 * that lies. The third wall (the answer cache) lives in `answerCache.ts`.
 */

export interface QuotaDefaults {
  /** UGO_CUSTOMER_HOURLY_MESSAGES: per-customer override in `customers` */
  hourlyMessages: number;
  /** UGO_CUSTOMER_DAILY_BUDGET_USD: per-customer override in `customers` */
  dailyBudgetUsd: number;
  /** the HOUSE's timezone (ADR-050): the day boundary is the family's, not UTC */
  timezone: string;
}

export type QuotaVerdict =
  | { allowed: true }
  | { allowed: false; wall: "hourly"; retryAfterSeconds: number }
  | { allowed: false; wall: "daily" };

/** same Intl trick as the budget ledger: the date in the house's own day */
function localDate(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

export class CustomerQuota {
  public constructor(
    private readonly db: DbClient,
    private readonly defaults: QuotaDefaults,
    /** ADR-098: la connessione della casa del cliente; assente = `db` */
    private readonly dbFor?: (accountId: string) => DbClient,
  ) {}

  public async check(
    customerId: string,
    at: Date = new Date(),
    accountId?: string,
  ): Promise<QuotaVerdict> {
    const db =
      accountId !== undefined && this.dbFor !== undefined ? this.dbFor(accountId) : this.db;
    const [customer] = await db
      .select({
        hourlyMessageLimit: customers.hourlyMessageLimit,
        dailyBudgetUsd: customers.dailyBudgetUsd,
      })
      .from(customers)
      .where(eq(customers.id, customerId));

    const hourlyLimit = customer?.hourlyMessageLimit ?? this.defaults.hourlyMessages;
    const budgetUsd =
      customer?.dailyBudgetUsd !== null && customer?.dailyBudgetUsd !== undefined
        ? Number(customer.dailyBudgetUsd)
        : this.defaults.dailyBudgetUsd;

    // wall 1: the hourly quota, a count over the (customer_id, ts) index
    const hourAgo = new Date(at.getTime() - 60 * 60_000);
    const [hourly] = await db
      .select({ count: sql<string>`count(*)` })
      .from(customerMessages)
      .where(
        and(
          eq(customerMessages.customerId, customerId),
          eq(customerMessages.role, "user"),
          gt(customerMessages.ts, hourAgo),
        ),
      );
    if (Number(hourly?.count ?? 0) >= hourlyLimit) {
      // honest enough without another query: the window slides by the minute
      return { allowed: false, wall: "hourly", retryAfterSeconds: 15 * 60 };
    }

    // wall 2: the daily cap, summed in the house's own day (ADR-050)
    const today = localDate(this.defaults.timezone, at);
    const [spent] = await db
      .select({ total: sql<string>`coalesce(sum(${customerMessages.costUsd}), 0)` })
      .from(customerMessages)
      .where(
        and(
          eq(customerMessages.customerId, customerId),
          sql`(${customerMessages.ts} at time zone ${this.defaults.timezone})::date = ${today}::date`,
        ),
      );
    if (Number(spent?.total ?? 0) >= budgetUsd) return { allowed: false, wall: "daily" };

    return { allowed: true };
  }
}
