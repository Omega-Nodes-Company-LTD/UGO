import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { customers } from "./customers.js";
import { ticketStatus } from "./enums.js";
import { gosini } from "./gosini.js";
import { householdId } from "./households.js";

/**
 * A collected request (ADR-052). The gosino never executes work: it writes
 * down what the customer wants and the owner triages from the panel. The
 * exemplar that collected it stays on the row — that is half of the
 * "which gosino works best" statistics.
 */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    /** the exemplar that collected the request */
    gosinoId: uuid("gosino_id").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    /** AES-256-GCM ciphertext under the household DEK (rule 6) */
    title: text("title").notNull(),
    /** AES-256-GCM ciphertext under the household DEK (rule 6) */
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("tickets_customer_idx").on(table.customerId),
    index("tickets_status_idx").on(table.status),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "tickets_household_customer_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.householdId, table.gosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
      name: "tickets_household_gosino_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * The B2B biography, deliberately separate from `messages` (ADR-052): the
 * family's conversation history never mixes with a customer's, per-customer
 * stats and GDPR enumeration stay trivial, and `loadHistory` cannot leak a
 * customer turn into the family prompt.
 *
 * The `(customer_id, ts)` index IS the hourly rate limiter (ADR-055): the
 * quota is a count over this index, always server-side, never in memory.
 */
export const customerMessages = pgTable(
  "customer_messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    /** the exemplar the customer chose to talk to */
    gosinoId: uuid("gosino_id").notNull(),
    /** set null: closing a ticket must not orphan its conversation */
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    role: text("role").notNull(),
    /** AES-256-GCM ciphertext under the household DEK (rule 6) */
    text: text("text").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    /** true when the reply came from the answer cache (ADR-055): zero cost */
    cached: boolean("cached").notNull().default(false),
  },
  (table) => [
    index("customer_messages_customer_ts_idx").on(table.customerId, table.ts),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_messages_household_customer_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.householdId, table.gosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
      name: "customer_messages_household_gosino_fk",
    }).onDelete("cascade"),
  ],
);
