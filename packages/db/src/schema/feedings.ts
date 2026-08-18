import { sql } from "drizzle-orm";
import { foreignKey, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { feedingKind } from "./enums.js";
import { gosini } from "./gosini.js";
import { accountId } from "./accounts.js";

/**
 * Il cibo (ADR-072): l'altra metà del salvadanaio.
 *
 * `budget_ledger` registra quanto un esemplare CONSUMA; qui c'è quanto gli
 * viene dato. Il saldo è la differenza — un salvadanaio, non una razione
 * giornaliera: il lavoro di ieri paga le parole di oggi.
 *
 * Append-only per GRANT come `births` e l'audit log (ADR-049): un pasto è un
 * atto, non un record da correggere. Sbagliato l'importo, si dà da mangiare
 * di meno la prossima volta — non si riscrive il passato.
 *
 * `amount_usd` è la stessa unità del ledger, perché è l'unità in cui il
 * mangiare costa davvero. Nessuna moneta inventata: il gosino non fattura,
 * il suo umano sì, e questa tabella è la quota che gli attribuisce.
 */
export const feedings = pgTable(
  "feedings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    kind: feedingKind("kind").notNull(),
    amountUsd: numeric("amount_usd", { precision: 10, scale: 6 }).notNull(),
    /** «ticket Rossi di marzo», «gli ho voluto bene» — mai PII, sono note brevi */
    note: text("note"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feedings_gosino_idx").on(table.gosinoId),
    index("feedings_account_idx").on(table.accountId),
    foreignKey({
      columns: [table.accountId, table.gosinoId],
      foreignColumns: [gosini.accountId, gosini.id],
      name: "feedings_account_gosino_fk",
    }).onDelete("cascade"),
  ],
);
