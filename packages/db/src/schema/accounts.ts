import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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
export const accounts = pgTable(
  "accounts",
  {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** stable, human-typeable handle — used in URLs, logs and the panel */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /**
   * ADR-061: la natura del tenant — una casa (PET, ricordi, affetto) o
   * un'azienda (reception, clienti, ticket). Il nome tecnico `accounts`
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
   * ADR-104 — l'iniziativa (ADR-027), **di questa casa e scritta**.
   *
   * Viveva in un campo di un oggetto in RAM: si spegneva dal pannello e
   * tornava accesa al riavvio, e — da quando le case sono più di una — la
   * spegneva **per tutte**, perché l'oggetto era uno per processo. Due
   * difetti con la stessa causa: uno stato della casa tenuto fuori dalla
   * casa.
   *
   * `null` non è «spento»: è «non deciso qui», e lascia l'ultima parola a
   * `UGO_INITIATIVE`. È la differenza fra una casa che non si è mai espressa
   * e una che ha detto di no, e serve perché il default d'ambiente resti
   * governabile dal server senza sovrascrivere una scelta.
   */
  initiative: boolean("initiative"),
  /**
   * ADR-081 — le due autorizzazioni della specie, e sono due cose diverse.
   *
   * `is_foundry`: questa casa può **coniare capostipiti**, cioè far esistere un
   * gosino che non è nato da nessuno. È l'allevamento fondatore, e per
   * costruzione ce n'è uno solo per installazione: la casa più vecchia, quella
   * che c'era prima delle altre.
   *
   * `can_breed`: questa casa può **far nascere cucciolate**. Non è la stessa
   * cosa — un allevamento autorizzato alleva ma non conia, e una famiglia non
   * fa né l'uno né l'altro: adotta.
   *
   * Tutte e due `false` di default, che è ciò che deve essere una casa nuova.
   * Se un giorno una casa può fare tutto per svista, la specie diventa una
   * funzione di chi ha accesso al pannello.
   */
  isFoundry: boolean("is_foundry").notNull().default(false),
  canBreed: boolean("can_breed").notNull().default(false),
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
  /**
   * ADR-109: per quante ore questa casa tiene le foto. `0` = non si tengono,
   * ed è il default — l'album non si accende da solo.
   *
   * **Prima retention per-account del progetto**: le altre quattro (impronte
   * ignote, audit, audio, backup) sono costanti di codice o env di processo,
   * cioè decisioni nostre. Questa è una decisione della famiglia, e sta dove
   * stanno le sue: sulla riga della casa, come il fuso e il posto.
   */
  photoRetentionHours: integer("photo_retention_hours").notNull().default(0),
  /**
   * Questo commento è la prova (con la sua assenza) che ADR-113 è qui: le
   * colonne `lat`/`lon`/`place` NON stanno più su `accounts` — sono nella
   * tabella `places`. La migrazione `0056_i-luoghi-dell-account` le ha
   * spostate e droppate; chi le ri-aggiunge qui sta ricreando due verità
   * sulla stessa cosa.
   */
  /**
   * This house's data key (DEK), AES-256-GCM-wrapped with the master key in
   * UGO_DATA_KEY. Destroying this column erases the family beyond recovery —
   * which is what makes erasure demonstrable rather than merely careful.
   */
  wrappedDataKey: bytea("wrapped_data_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    // ADR-109: cinque scalini o zero, e il database è dove diventa vero
    check(
      "accounts_photo_retention_steps",
      sql`${table.photoRetentionHours} in (0, 6, 12, 24, 48, 72)`,
    ),
    check("accounts_kind", sql`${table.kind} in ('home', 'business')`),
  ],
);

/** The bootstrap house, seeded alongside `ugo-prime` (ADR-015, ADR-019). */
export const PRIME_ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";

/**
 * The `account_id` column every tenant-scoped table carries.
 *
 * The two-function shape exists to keep the column's *type*. Annotated
 * `PgColumnBuilderBase` — as this was — every table built with the helper got a
 * `account_id` of type `unknown`, so `eq(beings.accountId, x)` compiled
 * against anything and a missing tenant filter was invisible to the compiler.
 * That is a fair part of why ADR-019 phase 1 shipped with the columns in place
 * and almost nothing filtering on them. The inner function keeps the precise
 * builder type; the outer one satisfies `explicit-module-boundary-types`
 * without throwing it away.
 */
function buildAccountId() {
  // ADR-048 tempo 2: niente `.default()`. Finché c'era, una scrittura che
  // dimenticava lo scope finiva nella casa seminata **invece di fallire** —
  // silenziosamente, e nella casa sbagliata. Ora il tipo la rifiuta a
  // compilazione e Postgres a runtime.
  return uuid("account_id")
    .notNull()
    .references(() => accounts.id);
}

export function accountId(): ReturnType<typeof buildAccountId> {
  return buildAccountId();
}
