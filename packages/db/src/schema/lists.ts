import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { beings } from "./beings.js";
import { accountId } from "./accounts.js";

/**
 * Le liste (ADR-076): la spesa, le cose da fare, la ferramenta.
 *
 * **Della casa, non dell'esemplare**: la spesa è una sola anche se i gosini
 * sono tre — altrimenti la famiglia compra due volte il latte. Chi ha scritto
 * la riga si vede da `being_id`, quando si sa.
 *
 * `list` è testo libero e non un enum, per la stessa ragione delle specie
 * (ADR-014): la prima lista nuova che viene in mente a qualcuno non deve
 * chiedere una migrazione.
 *
 * A differenza di `births` e `feedings`, qui UPDATE e DELETE ci sono: una
 * lista si corregge: non è un atto, è una lista della spesa.
 */
export const listItems = pgTable(
  "list_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    list: text("list").notNull(),
    /** cifrato a riposo come i ricordi: «cosa compra» è un fatto di famiglia */
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    beingId: uuid("being_id").references(() => beings.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (table) => [index("list_items_account_list_idx").on(table.accountId, table.list)],
);
