import { sql } from "drizzle-orm";
import { date, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

// The piggy bank (PROGETTO §6): every LLM call is recorded here by
// packages/memory/llmClient — the ONLY module allowed to call the provider.
// The daily spend check reads this table server-side, never a client estimate.
export const budgetLedger = pgTable(
  "budget_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    date: date("date").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    // tokens_in is the billed input total; the two cache columns break it
    // down so the saving from prompt caching (§5.5) is actually measurable
    // instead of merely believed.
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
    tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  },
  (table) => [index("budget_ledger_date_idx").on(table.date)],
);
