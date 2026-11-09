import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accessTokens } from "./access-tokens.js";
import { accounts } from "./accounts.js";

/**
 * Come un dispositivo entra in casa quando la casa sta sul web (ADR-127).
 *
 * Due porte, entrambe a uso singolo e a scadenza, ed entrambe salvate come
 * SHA-256 e mai in chiaro — esattamente come `access_tokens`: un dump di
 * queste tabelle non apre niente. Niente RLS, per la stessa ragione di
 * `access_tokens`: si leggono PRIMA di sapere chi bussa, quindi non c'è una
 * casa con cui filtrarle.
 */

/** Il codice di abbinamento: 8 caratteri, 10 minuti, una volta sola. */
export const pairingCodes = pgTable(
  "pairing_codes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    /** chi l'ha chiesto: la chiave del pannello, per l'audit */
    createdByTokenId: text("created_by_token_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** la chiave nata da questo codice, per poterla revocare risalendo */
    tokenId: uuid("token_id").references(() => accessTokens.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pairing_codes_account_idx").on(table.accountId)],
);

/** Il link per entrare con l'email: 15 minuti, una volta sola. */
export const loginLinks = pgTable(
  "login_links",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_links_account_idx").on(table.accountId)],
);
