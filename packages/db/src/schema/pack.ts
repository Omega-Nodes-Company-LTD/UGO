import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  real,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { SYMMETRIC_RELATION_TYPES } from "@ugo/shared";
import { beings } from "./beings.js";
import { gosini } from "./gosini.js";
import { householdId } from "./households.js";
import { relationType } from "./enums.js";

/**
 * What THIS exemplar feels about a being (ADR-014). Per-exemplar by design:
 * two UGOs in the same house are allowed to disagree about the same person.
 */
export const bonds = pgTable(
  "bonds",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    gosinoId: uuid("gosino_id").notNull(),
    beingId: uuid("being_id").notNull(),
    /** 0..1 — how well this exemplar knows the being */
    familiarity: real("familiarity").notNull().default(0),
    /** -1..1 — how it feels about them */
    affinity: real("affinity").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    interactionCount: integer("interaction_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("bonds_gosino_being_uq").on(table.gosinoId, table.beingId),
    index("bonds_gosino_idx").on(table.gosinoId),
    index("bonds_household_idx").on(table.householdId),
    // composite, not two separate keys: this is what makes "exemplar of house
    // A bonded to a being of house B" impossible to write at all (ADR-019)
    foreignKey({
      name: "bonds_being_same_household_fk",
      columns: [table.householdId, table.beingId],
      foreignColumns: [beings.householdId, beings.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "bonds_gosino_same_household_fk",
      columns: [table.householdId, table.gosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
    }).onDelete("cascade"),
    check("bonds_familiarity_range", sql`${table.familiarity} between 0 and 1`),
    check("bonds_affinity_range", sql`${table.affinity} between -1 and 1`),
  ],
);

/**
 * The graph between the others, independent of UGO: that Ivan is Sofia's
 * parent is true whether or not UGO exists.
 *
 * Symmetric types are stored once, normalized on being_a < being_b, so
 * partner_of(A,B) and partner_of(B,A) cannot coexist as distinct rows.
 * Asymmetric types (parent_of, cares_for, avoids) stay oriented.
 *
 * Both ends are pinned to the same house by composite foreign keys (ADR-019):
 * a relation that links two families cannot be inserted.
 */
export const relations = pgTable(
  "relations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    beingA: uuid("being_a").notNull(),
    beingB: uuid("being_b").notNull(),
    type: relationType("type").notNull(),
    strength: real("strength").notNull().default(1),
  },
  (table) => [
    unique("relations_pair_type_uq").on(table.beingA, table.beingB, table.type),
    index("relations_being_a_idx").on(table.beingA),
    index("relations_being_b_idx").on(table.beingB),
    index("relations_household_idx").on(table.householdId),
    foreignKey({
      name: "relations_being_a_same_household_fk",
      columns: [table.householdId, table.beingA],
      foreignColumns: [beings.householdId, beings.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "relations_being_b_same_household_fk",
      columns: [table.householdId, table.beingB],
      foreignColumns: [beings.householdId, beings.id],
    }).onDelete("cascade"),
    check("relations_no_self_link", sql`${table.beingA} <> ${table.beingB}`),
    // sql.raw, not a bound parameter: drizzle-kit renders check constraints
    // into a migration file, where a `$1` placeholder is never substituted
    check(
      "relations_symmetric_normalized",
      sql`${table.type} not in (${sql.raw(
        SYMMETRIC_RELATION_TYPES.map((value) => `'${value}'`).join(", "),
      )}) or ${table.beingA} < ${table.beingB}`,
    ),
  ],
);
