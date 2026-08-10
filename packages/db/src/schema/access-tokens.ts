import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { households } from "./households.js";
import { accessRole } from "./enums.js";

/**
 * Who is holding the token (ADR-019).
 *
 * A shared secret says only "you know the password"; with more than one
 * household we need it to say *which* household, and with what authority.
 *
 * The token itself is never stored — only its SHA-256. A dump of this table
 * grants nothing, and a token can only ever be shown once, at creation.
 */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** null only for `operator`, whose authority spans the whole neighbourhood */
    householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
    /** hex SHA-256 of the bearer token; the clear value never touches the database */
    tokenHash: text("token_hash").notNull().unique(),
    role: accessRole("role").notNull(),
    /** what this token is for, in words: "telefono di Monika", "dock cucina" */
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** touched at most once a minute: this is a liveness hint, not an audit log */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("access_tokens_household_idx").on(table.householdId)],
);
