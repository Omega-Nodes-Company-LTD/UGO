import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { accessRole } from "./enums.js";

/**
 * L'accesso senza utenti (ADR-124). Nessuna tabella `users` (regola 9,
 * ADR-061): l'identità di accesso APPARTIENE a un account.
 *
 * Come `access_tokens`, queste tabelle si leggono PRIMA di sapere di che
 * account si tratta — è proprio ciò che servono a scoprire — e per questo
 * restano leggibili al ruolo applicativo (ADR-048 §7). Non contengono niente
 * di leggibile: hash, cifrati, scadenze.
 */

/** Un'email che entra in un account. Una email, un account. */
export const accountLogins = pgTable(
  "account_logins",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** HMAC dell'email normalizzata con un pepe derivato dalla chiave madre */
    emailHash: text("email_hash").notNull().unique(),
    /** l'email, cifrata con la DEK dell'account: muore con lui */
    emailEnc: text("email_enc").notNull(),
    role: accessRole("role").notNull().default("owner"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    termsVersion: text("terms_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_logins_account_idx").on(table.accountId)],
);

/**
 * Un link monouso, quindici minuti. L'email in attesa di conferma sta cifrata
 * con la chiave madre: l'account, per un'iscrizione, non esiste ancora.
 */
export const loginLinks = pgTable(
  "login_links",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tokenHash: text("token_hash").notNull().unique(),
    emailHash: text("email_hash").notNull(),
    emailEnc: text("email_enc").notNull(),
    purpose: text("purpose").notNull(),
    termsVersion: text("terms_version"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("login_links_purpose", sql`${table.purpose} in ('signup', 'login')`),
    index("login_links_email_idx").on(table.emailHash),
  ],
);

/** Una sessione del browser: si vede e si revoca dal pannello. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    loginId: uuid("login_id")
      .notNull()
      .references(() => accountLogins.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** il dispositivo in parole, dal browser: «Firefox su Android» */
    label: text("label").notNull().default("browser"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("sessions_account_idx").on(table.accountId)],
);

/**
 * L'abbinamento di un chiosco (ADR-121): un codice di sei cifre, dieci
 * minuti, una volta sola. Diventa un `access_tokens` etichettato «chiosco».
 */
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
    label: text("label").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pairing_codes_account_idx").on(table.accountId)],
);

/**
 * Il rate limit (ADR-121), su Postgres e non in memoria: sopravvive al
 * riavvio e vale per tutti i processi. La chiave è un HMAC (l'IP è un dato
 * personale), la finestra è fissa.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.bucket, table.keyHash, table.windowStart] }),
    index("rate_limits_window_idx").on(table.windowStart),
  ],
);
