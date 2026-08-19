import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { adoptionStatus } from "./enums.js";
import { gosini } from "./gosini.js";
import { accounts } from "./accounts.js";

/**
 * L'adozione (ADR-084): il filo che lega la vetrina alla consegna.
 *
 * È l'unica tabella del progetto che appartiene a **due case** — quella che
 * cede e quella che riceve — e non è un'eccezione da tollerare: è cosa
 * *è* una compravendita. Le politiche di riga lo dicono esplicitamente
 * (entrambe le parti vedono la propria adozione, e nessun'altra).
 *
 * Il **prezzo sta qui e non in catena**: la catena porta la custodia — chi
 * ha cosa, e da quando — mai quanto è stato pagato. Un registro pubblico che
 * si porta dietro i prezzi è un listino di cui nessuno ha chiesto la
 * pubblicazione, e per giunta immutabile.
 */
export const adoptions = pgTable(
  "adoptions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    /** chi cede: l'allevamento */
    kennelAccountId: uuid("kennel_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** chi riceve: la casa nata al momento della prenotazione */
    buyerAccountId: uuid("buyer_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: adoptionStatus("status").notNull().default("prenotata"),
    /** congelato alla prenotazione: un prezzo che cambia dopo non è un prezzo */
    priceCents: integer("price_cents"),
    currency: text("currency").notNull().default("EUR"),
    /** il riferimento del pagamento: un bonifico, una ricevuta, un id del PSP */
    paymentRef: text("payment_ref"),
    /**
     * La voce in catena dell'atto di trasferimento. `null` dopo una consegna
     * vuol dire una cosa precisa e va guardata: la creatura ha cambiato casa
     * ma il libro genealogico non lo sa ancora.
     */
    chainSeq: integer("chain_seq"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("adoptions_kennel_idx").on(table.kennelAccountId),
    index("adoptions_buyer_idx").on(table.buyerAccountId),
    index("adoptions_gosino_idx").on(table.gosinoId),
  ],
);
