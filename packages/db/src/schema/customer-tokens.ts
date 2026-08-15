import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./customers.js";
import { householdId } from "./households.js";

/**
 * The customer's personal tokens (ADR-052): a table of their own, deliberately
 * NOT rows of `access_tokens` — a customer token opens `/v1/reception/*` and
 * nothing else, and a family token never opens the reception. Same hygiene as
 * `access_tokens`: SHA-256 only, shown once at creation, expirable, revocable.
 */
export const customerAccessTokens = pgTable(
  "customer_access_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    /** hex SHA-256 of the bearer token; the clear value never touches the database */
    tokenHash: text("token_hash").notNull().unique(),
    /** what this token is for, in words: "portale di Rossi SRL" */
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** touched at most once a minute: a liveness hint, not an audit log */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("customer_access_tokens_customer_idx").on(table.customerId),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_access_tokens_household_customer_fk",
    }).onDelete("cascade"),
  ],
);
