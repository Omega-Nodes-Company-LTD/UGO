import { sql } from "drizzle-orm";
import { boolean, check, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea } from "./types.js";

/**
 * The tenant (ADR-019): one house, one family, one piggy bank, one data key.
 *
 * Why not the gosino itself: ADR-014 promises that two exemplars in the same
 * house may disagree about the same person — which requires the *being* to be
 * shared and only the *bond* to differ. A scope narrower than the house makes
 * that promise unkeepable, and an integration test says so out loud.
 *
 * So the house holds the pack, the exemplars and the money; the gosino holds
 * the character, the memories and the mood.
 */
export const households = pgTable(
  "households",
  {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** stable, human-typeable handle — used in URLs, logs and the panel */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /**
   * ADR-061: la natura del tenant — una casa (PET, ricordi, affetto) o
   * un'azienda (reception, clienti, ticket). Il nome tecnico `households`
   * resta; la lingua cambia dove la vedono le persone. Oggi descrive, non
   * vieta: è il posto dove il futuro gating vive, non un regolamento
   * retroattivo. `text` + check, non enum Postgres (la trappola di
   * drizzle-kit che non genera CREATE TYPE è già stata pagata due volte).
   */
  kind: text("kind").notNull().default("home"),
  /** the house's own clock and language: two families, two answers */
  timezone: text("timezone").notNull().default("Europe/Rome"),
  locale: text("locale").notNull().default("it-IT"),
  /** null falls back to the process-wide default */
  dailyBudgetUsd: numeric("daily_budget_usd", { precision: 10, scale: 4 }),
  /**
   * Il metabolismo (ADR-072): ogni esemplare ha un salvadanaio suo, e a saldo
   * esaurito ha fame. **Spento per default, e apposta**: acceso d'ufficio,
   * ogni installazione esistente si sveglierebbe con le creature affamate
   * dopo un aggiornamento — la sorpresa che la visione vieta. Il tetto della
   * casa resta comunque il muro esterno: la fame stringe, non allarga.
   */
  metabolism: boolean("metabolism").notNull().default(false),
  /**
   * Dove sta questa casa, per il cielo del recinto (gruppo 12).
   *
   * Stava in `UGO_HOME_LAT`/`UGO_HOME_LON`, cioè nell'ambiente del PROCESSO —
   * il che vuol dire un server per famiglia, che è esattamente ciò che ADR-019
   * esiste per non fare. Il tempo che fa è della casa come il fuso e la
   * lingua, e sta sulla riga della casa.
   *
   * `place` è come l'ha scritto una persona («Torino», «Via Roma 1, Milano»):
   * si tiene per poterlo rimostrare nel pannello, perché due coordinate non
   * dicono a nessuno se ha scelto il posto giusto.
   */
  lat: numeric("lat", { precision: 8, scale: 5 }),
  lon: numeric("lon", { precision: 8, scale: 5 }),
  place: text("place"),
  /**
   * This house's data key (DEK), AES-256-GCM-wrapped with the master key in
   * UGO_DATA_KEY. Destroying this column erases the family beyond recovery —
   * which is what makes erasure demonstrable rather than merely careful.
   */
  wrappedDataKey: bytea("wrapped_data_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [check("households_kind", sql`${table.kind} in ('home', 'business')`)],
);

/** The bootstrap house, seeded alongside `ugo-prime` (ADR-015, ADR-019). */
export const PRIME_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000002";

/**
 * The `household_id` column every tenant-scoped table carries.
 *
 * The two-function shape exists to keep the column's *type*. Annotated
 * `PgColumnBuilderBase` — as this was — every table built with the helper got a
 * `household_id` of type `unknown`, so `eq(beings.householdId, x)` compiled
 * against anything and a missing tenant filter was invisible to the compiler.
 * That is a fair part of why ADR-019 phase 1 shipped with the columns in place
 * and almost nothing filtering on them. The inner function keeps the precise
 * builder type; the outer one satisfies `explicit-module-boundary-types`
 * without throwing it away.
 */
function buildHouseholdId() {
  // ADR-048 tempo 2: niente `.default()`. Finché c'era, una scrittura che
  // dimenticava lo scope finiva nella casa seminata **invece di fallire** —
  // silenziosamente, e nella casa sbagliata. Ora il tipo la rifiuta a
  // compilazione e Postgres a runtime.
  return uuid("household_id")
    .notNull()
    .references(() => households.id);
}

export function householdId(): ReturnType<typeof buildHouseholdId> {
  return buildHouseholdId();
}
