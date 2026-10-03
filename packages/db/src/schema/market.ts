import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountId, accounts } from "./accounts.js";
import { gosini } from "./gosini.js";

/**
 * Il mercato dei cuccioli (ADR-131): chi vende incassa con Stripe Connect, e
 * noi non tocchiamo i soldi altrui. Qui stanno solo lo stato del conto —
 * può incassare? può ricevere versamenti? cosa gli manca? — mai documenti,
 * IBAN o dati d'identità: quelli li custodisce Stripe.
 */
export const breederPayoutAccounts = pgTable(
  "breeder_payout_accounts",
  {
    accountId: accountId().primaryKey(),
    /** `acct_…` presso Stripe */
    stripeAccountId: text("stripe_account_id").notNull().unique(),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    /** quante cose Stripe chiede ancora (il numero, non le cose) */
    requirementsDue: integer("requirements_due").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Una segnalazione su un annuncio (ADR-131 §7). Il motivo è una categoria; la
 * nota è facoltativa, corta, e la legge solo l'operatore.
 */
export const listingReports = pgTable(
  "listing_reports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    /** l'allevamento che vende: per sapere di chi è l'annuncio senza attraversare le case */
    kennelAccountId: uuid("kennel_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    reporterAccountId: uuid("reporter_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    note: text("note"),
    status: text("status").notNull().default("aperta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    check("listing_reports_reason", sql`${table.reason} in ('maltrattamento', 'ingannevole', 'prezzo', 'altro')`),
    check("listing_reports_status", sql`${table.status} in ('aperta', 'sospeso', 'archiviata')`),
    check("listing_reports_note", sql`${table.note} is null or length(${table.note}) <= 500`),
    index("listing_reports_status_idx").on(table.status, table.createdAt),
  ],
);
