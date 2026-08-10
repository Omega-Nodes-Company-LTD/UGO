import { sql } from "drizzle-orm";
import {
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type PgColumnBuilderBase,
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

/** The `household_id` column every tenant-scoped table carries. */
export function householdId(): PgColumnBuilderBase {
  return uuid("household_id")
    .notNull()
    .default(PRIME_HOUSEHOLD_ID)
    .references(() => households.id);
}
