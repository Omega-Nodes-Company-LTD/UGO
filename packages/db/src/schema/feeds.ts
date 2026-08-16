import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { householdId } from "./households.js";

/**
 * I feed, e il consiglio del mattino (ADR-060, gruppo 10).
 *
 * Il proprietario iscrive la casa a dei feed RSS/Atom; i job li scaricano e li
 * embeddano col modello locale; il sogno incrocia le novità con la conoscenza
 * dei clienti (`customer_chunks`, ADR-054) e — sopra una soglia ALTA — si
 * sveglia con un consiglio in testa: «è uscita X, proporla a Rossi SRL».
 *
 * **Testo in chiaro, ed è una decisione**: un feed è contenuto PUBBLICO per
 * definizione — cifrarlo proteggerebbe dal ladro di database una notizia che
 * sta su internet. La regola 6 protegge le conversazioni e le persone, non i
 * comunicati stampa. L'incrocio col cliente invece è sensibile, e infatti non
 * vive qui: vive nel desiderio del gosino, e non esce MAI in reception.
 */

export const rssFeeds = pgTable(
  "rss_feeds",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    url: text("url").notNull(),
    /** come lo chiama il pannello: «blog di Postgres», «changelog di React» */
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    /** 'ok' o l'ultima classe di errore, per il pannello — mai il corpo della risposta */
    lastStatus: text("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // lo stesso feed due volte è due download e zero informazione in più
    unique("rss_feeds_household_url_uq").on(table.householdId, table.url),
  ],
);

export const feedItems = pgTable(
  "feed_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    feedId: uuid("feed_id").notNull(),
    /** l'identità dell'articolo secondo il feed; il dedup è (feed, guid) */
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    link: text("link"),
    summary: text("summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** dal modello locale; null finché il giro di embedding non passa */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    /**
     * Quando ha fruttato un consiglio, se l'ha fruttato. È anche il freno:
     * un item consigliato non si riconsiglia, e il tetto giornaliero conta
     * queste righe — meglio un consiglio a settimana buono che tre al giorno
     * tirati.
     */
    advisedAt: timestamp("advised_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("feed_items_feed_guid_uq").on(table.feedId, table.guid),
    index("feed_items_household_created_idx").on(table.householdId, table.createdAt),
    foreignKey({
      columns: [table.feedId],
      foreignColumns: [rssFeeds.id],
      name: "feed_items_feed_fk",
    }).onDelete("cascade"),
  ],
);
