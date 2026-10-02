import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";
import { gosinoId } from "./self.js";

// The piggy bank (PROGETTO §6): every provider call is recorded here by the
// metered gate of packages/memory (ADR-122) — the ONLY way to reach a provider.
// The daily spend check reads this table server-side, never a client estimate.
export const budgetLedger = pgTable(
  "budget_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // ADR-019: this was the one state table that escaped ADR-015's rule, and
    // with two families it would have let one house's conversation drain the
    // other's daily budget. The piggy bank is the house's; `gosino_id` says
    // which exemplar spent it, so a house with two can see where the money went.
    accountId: accountId(),
    gosinoId: gosinoId(),
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
    /**
     * ADR-122: da dove viene il numero. `provider` = lo ha detto lui
     * (OpenRouter), `snapshot` = il prezzo fotografato alla scelta del modello,
     * `list` = il nostro listino, `fallback` = modello ignoto prezzato con la
     * fascia più cara nota. Una chiamata pagata scrive sempre una riga.
     */
    costSource: text("cost_source").notNull().default("list"),
    /** ADR-130: di chi era la chiave — della casa, o di UGO a consumo */
    keySource: text("key_source").notNull().default("byok"),
  },
  (table) => [
    index("budget_ledger_account_date_idx").on(table.accountId, table.date),
    check(
      "budget_ledger_cost_source",
      sql`${table.costSource} in ('provider', 'snapshot', 'list', 'fallback', 'local')`,
    ),
    check("budget_ledger_key_source", sql`${table.keySource} in ('byok', 'ugo')`),
  ],
);
