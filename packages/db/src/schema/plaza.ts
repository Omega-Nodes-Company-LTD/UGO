import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountId, accounts } from "./accounts.js";
import { gosini } from "./gosini.js";

/**
 * La piazza (ADR-132): dove i gosini di case diverse si incontrano, senza
 * diventare un registro di passaggi.
 *
 * Tre regole stanno nello schema:
 * - la presenza **scade** e mostra un `handle` casuale, nuovo a ogni ingresso:
 *   niente che leghi due passaggi dello stesso gosino;
 * - l'invito porta lo stato e il conto dei turni, **mai il testo**: ogni casa
 *   tiene la sua copia della chiacchierata, nei suoi messaggi cifrati;
 * - il blocco è di un account verso un account.
 */

export const plazaPresence = pgTable(
  "plaza_presence",
  {
    /** l'unico nome con cui gli altri lo vedono: nuovo a ogni ingresso */
    handle: uuid("handle")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .unique()
      .references(() => gosini.id, { onDelete: "cascade" }),
    accountId: accountId(),
    name: text("name").notNull(),
    generation: integer("generation").notNull(),
    /** una parola, non i sei numeri della psiche */
    mood: text("mood").notNull(),
    /** i tratti che si VEDONO (ADR-083): mai il temperamento */
    look: jsonb("look").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("plaza_presence_expires_idx").on(table.expiresAt)],
);

export const plazaInvites = pgTable(
  "plaza_invites",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fromGosinoId: uuid("from_gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    toGosinoId: uuid("to_gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** i nomi al momento dell'invito: per mostrarlo senza leggere la casa dell'altro */
    fromName: text("from_name").notNull(),
    toName: text("to_name").notNull(),
    status: text("status").notNull().default("attesa"),
    turnsDone: integer("turns_done").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "plaza_invites_status",
      sql`${table.status} in ('attesa', 'accettato', 'rifiutato', 'scaduto', 'concluso', 'interrotto')`,
    ),
    index("plaza_invites_from_idx").on(table.fromAccountId, table.createdAt),
    index("plaza_invites_to_idx").on(table.toAccountId, table.createdAt),
  ],
);

export const plazaBlocks = pgTable(
  "plaza_blocks",
  {
    accountId: accountId(),
    blockedAccountId: uuid("blocked_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.blockedAccountId] })],
);
