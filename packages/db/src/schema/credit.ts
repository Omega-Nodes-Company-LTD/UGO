import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";

/**
 * Il credito della casa (ADR-130): le chiavi UGO a consumo.
 *
 * Append-only, come `feedings`: il saldo è la somma, e una riga sbagliata si
 * corregge con un'altra riga (`adjust`), mai riscrivendo. Gli importi sono
 * MICRO-EURO interi — niente virgola mobile sui soldi. Positivi le ricariche e
 * i rimborsi, negativi i consumi.
 *
 * `ref` collega ogni movimento alla sua causa: la riga di `budget_ledger` per
 * un consumo, l'id del pagamento del PSP per una ricarica. Ogni centesimo è
 * riconducibile a una chiamata o a un incasso.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    kind: text("kind").notNull(),
    amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
    ref: text("ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("credit_ledger_kind", sql`${table.kind} in ('topup', 'usage', 'refund', 'adjust')`),
    check(
      "credit_ledger_sign",
      sql`(${table.kind} = 'usage' and ${table.amountMicros} <= 0)
        or (${table.kind} in ('topup', 'refund') and ${table.amountMicros} >= 0)
        or ${table.kind} = 'adjust'`,
    ),
    index("credit_ledger_account_idx").on(table.accountId, table.createdAt),
  ],
);
