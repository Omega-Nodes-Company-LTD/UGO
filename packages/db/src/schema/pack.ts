import { sql } from "drizzle-orm";
import {
  check,
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
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    beingId: uuid("being_id")
      .notNull()
      .references(() => beings.id, { onDelete: "cascade" }),
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
 */
export const relations = pgTable(
  "relations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    beingA: uuid("being_a")
      .notNull()
      .references(() => beings.id, { onDelete: "cascade" }),
    beingB: uuid("being_b")
      .notNull()
      .references(() => beings.id, { onDelete: "cascade" }),
    type: relationType("type").notNull(),
    strength: real("strength").notNull().default(1),
  },
  (table) => [
    unique("relations_pair_type_uq").on(table.beingA, table.beingB, table.type),
    index("relations_being_a_idx").on(table.beingA),
    index("relations_being_b_idx").on(table.beingB),
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
