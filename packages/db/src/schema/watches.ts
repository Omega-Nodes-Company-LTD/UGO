import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid, vector } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";
import { gosinoId } from "./self.js";

/**
 * Le cose che segue (ADR-133): quello che il proprietario ha detto di voler
 * sapere, fare o temere — «ho una curiosità su…», «voglio andare in
 * Uganda» — e che UGO tiene d'occhio nel mondo finché serve.
 *
 * Il soggetto e le ricerche sono **del proprietario** e dicono cosa ha in
 * testa: stanno cifrati (regola 6). Il vettore no — come quello dei ricordi —
 * perché il sogno deve confrontarlo con le novità, e un vettore non si legge.
 */

export const WATCH_KINDS = ["curiosita", "progetto", "preoccupazione"] as const;
export const WATCH_STATUSES = ["attivo", "chiuso"] as const;
export const WATCH_SOURCES = ["conversazione", "pannello"] as const;
export const FIND_VERDICTS = ["proposto", "scartato"] as const;

export const watches = pgTable(
  "watches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    /** chi lo ha sentito: è lui che, un giorno, lo ricorderà */
    gosinoId: gosinoId(),
    kind: text("kind").notNull(),
    /** «andare in Uganda a febbraio», cifrato */
    subjectEnc: text("subject_enc").notNull(),
    /** le ricerche da fare nel mondo, JSON cifrato: escono verso i motori, mai col nome */
    queriesEnc: text("queries_enc").notNull(),
    /** null finché il sogno non lo calcola (quelli aggiunti dal pannello) */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    source: text("source").notNull().default("conversazione"),
    status: text("status").notNull().default("attivo"),
    /** dopo questa data non serve più guardare: un viaggio passato non ha notizie */
    until: timestamp("until", { withTimezone: true }).notNull(),
    lastSearchedAt: timestamp("last_searched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("watches_open_idx").on(table.accountId, table.status, table.until),
    check("watches_kind", sql`${table.kind} in ('curiosita', 'progetto', 'preoccupazione')`),
    check("watches_status", sql`${table.status} in ('attivo', 'chiuso')`),
    check("watches_source", sql`${table.source} in ('conversazione', 'pannello')`),
  ],
);

/**
 * Cosa ha trovato, proposto o scartato. Serve a non dire due volte la stessa
 * cosa e a non giudicare due volte lo stesso articolo: l'URL si riconosce da
 * un'impronta HMAC con la chiave della casa, e titolo, link e frase stanno
 * cifrati — insieme alla cosa seguita, dicono cosa ha in testa qualcuno.
 */
export const watchFinds = pgTable(
  "watch_finds",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    watchId: uuid("watch_id")
      .notNull()
      .references(() => watches.id, { onDelete: "cascade" }),
    accountId: accountId(),
    gosinoId: gosinoId(),
    urlHash: text("url_hash").notNull(),
    titleEnc: text("title_enc").notNull(),
    linkEnc: text("link_enc").notNull(),
    /** quello che ha detto, quando l'ha proposto; null se scartato */
    lineEnc: text("line_enc"),
    verdict: text("verdict").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("watch_finds_once").on(table.watchId, table.urlHash),
    index("watch_finds_day_idx").on(table.accountId, table.createdAt),
    check("watch_finds_verdict", sql`${table.verdict} in ('proposto', 'scartato')`),
  ],
);
