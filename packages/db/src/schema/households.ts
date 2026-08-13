import { sql } from "drizzle-orm";
import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
export const households = pgTable("households", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** stable, human-typeable handle — used in URLs, logs and the panel */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** the house's own clock and language: two families, two answers */
  timezone: text("timezone").notNull().default("Europe/Rome"),
  locale: text("locale").notNull().default("it-IT"),
  /** null falls back to the process-wide default */
  dailyBudgetUsd: numeric("daily_budget_usd", { precision: 10, scale: 4 }),
  /**
   * This house's data key (DEK), AES-256-GCM-wrapped with the master key in
   * UGO_DATA_KEY. Destroying this column erases the family beyond recovery —
   * which is what makes erasure demonstrable rather than merely careful.
   */
  wrappedDataKey: bytea("wrapped_data_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

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
