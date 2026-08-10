import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { householdId } from "./households.js";

/**
 * The population (ADR-015): the exemplars themselves. A gosino is a character
 * — memories, mood, genome. What belongs to the *house* rather than to the
 * creature (clock, language, money, data key) lives in `households` (ADR-019),
 * because one house may hold more than one exemplar.
 */
export const gosini = pgTable(
  "gosini",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    name: text("name").notNull(),
    /** 'cucina', 'officina', 'camera' — where this exemplar lives */
    locationLabel: text("location_label"),
    deviceId: text("device_id").unique(),
    parentGosinoId: uuid("parent_gosino_id").references((): AnyPgColumn => gosini.id),
    generation: integer("generation").notNull().default(0),
    bornAt: timestamp("born_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    index("gosini_household_idx").on(table.householdId),
    // the target of the composite keys that pin a bond to one house
    unique("gosini_household_id_uq").on(table.householdId, table.id),
  ],
);

/**
 * The genome: immutable per version. A trait is never updated in place — a new
 * version is created declaring its parent, so where a character came from stays
 * inspectable. The mutation engine itself is deliberately out of scope.
 */
export const traitSets = pgTable(
  "trait_sets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // jsonb precisely because this is the field meant to change shape:
    // typed columns would mean a migration per new trait
    traits: jsonb("traits").notNull().default({}),
    parentTraitSetId: uuid("parent_trait_set_id").references((): AnyPgColumn => traitSets.id),
    mutationNote: text("mutation_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("trait_sets_gosino_version_uq").on(table.gosinoId, table.version)],
);
