import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accountId, accounts } from "./accounts.js";

/**
 * L'incasso (ADR-125, ADR-130). Il PSP sa i prezzi e i soldi; qui sta solo ciò
 * che serve a decidere cosa sblocca un account e quando ricaricargli il
 * credito. Nessun numero di carta, nessun payload di webhook.
 */

/** L'abbonamento di un account: uno, dal PSP che l'ha incassato. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** l'id dell'abbonamento presso il PSP (`sub_…`, `I-…`) */
    externalId: text("external_id").notNull(),
    /** Stripe: il cliente (`cus_…`), per il portale */
    customerRef: text("customer_ref"),
    plan: text("plan").notNull(),
    /** nella lingua di Stripe: active, trialing, past_due, canceled… */
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("subscriptions_provider", sql`${table.provider} in ('stripe', 'paypal')`),
    check("subscriptions_plan", sql`${table.plan} in ('pro', 'allevamento')`),
  ],
);

/**
 * Ogni evento di un PSP, una volta sola: l'idempotenza dei webhook. Solo
 * l'identità dell'evento, mai il suo contenuto.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.eventId] })],
);

/** La ricarica automatica del credito (ADR-130 §5). */
export const creditSettings = pgTable(
  "credit_settings",
  {
    accountId: accountId().primaryKey(),
    autoRecharge: boolean("auto_recharge").notNull().default(false),
    thresholdMicros: bigint("threshold_micros", { mode: "number" }).notNull().default(2_000_000),
    amountMicros: bigint("amount_micros", { mode: "number" }).notNull().default(10_000_000),
    monthlyCapMicros: bigint("monthly_cap_micros", { mode: "number" }).notNull().default(50_000_000),
    /** chi custodisce il metodo salvato */
    provider: text("provider"),
    /**
     * Il metodo salvato, cifrato con la DEK della casa: per Stripe
     * `cus_…:pm_…`, per PayPal il token del vault. Non è un numero di carta:
     * è un puntatore che vale solo presso quel PSP, e con le nostre chiavi.
     */
    paymentMethodEnc: text("payment_method_enc"),
    /** una ricarica partita e non ancora accreditata dal webhook */
    pendingSince: timestamp("pending_since", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    /** perché la ricarica automatica si è spenta da sola */
    disabledReason: text("disabled_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("credit_settings_provider", sql`${table.provider} is null or ${table.provider} in ('stripe', 'paypal')`),
    check("credit_settings_positive", sql`${table.amountMicros} > 0 and ${table.thresholdMicros} >= 0`),
  ],
);
