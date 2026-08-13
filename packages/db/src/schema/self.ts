import { uuid } from "drizzle-orm/pg-core";
import { gosini } from "./gosini.js";

/**
 * The bootstrap exemplar (ADR-015). Seeded by the initial migration so a
 * single-exemplar system does not have to carry the ceremony of a population
 * it does not have: `gosino_id` defaults to this row everywhere.
 *
 * When the second exemplar is born the default is dropped and every writer
 * must declare who it is — a one-line migration, not a rewrite.
 */
export const PRIME_GOSINO_ID = "00000000-0000-4000-8000-000000000001";

/**
 * The `gosino_id` column every state table carries (ADR-015).
 *
 * Two functions, for the reason spelled out on `householdId()`: annotating the
 * return as `PgColumnBuilderBase` made every `gosino_id` in the schema type
 * `unknown`, and an `unknown` column compares equal to anything, so the
 * compiler could not see a missing scope.
 */
function buildGosinoId() {
  return uuid("gosino_id")
    .notNull()
    .default(PRIME_GOSINO_ID)
    .references(() => gosini.id);
}

export function gosinoId(): ReturnType<typeof buildGosinoId> {
  return buildGosinoId();
}
