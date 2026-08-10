import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * The population (ADR-015). One exemplar today (`ugo-prime`, generation 0),
 * but lineage and versioning exist from birth: adding them later would mean
 * attributing every existing row to an exemplar nobody ever recorded.
 */
export const gosini = pgTable("gosini", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  /** 'cucina', 'officina', 'camera' — where this exemplar lives */
  locationLabel: text("location_label"),
  deviceId: text("device_id").unique(),
  parentGosinoId: uuid("parent_gosino_id").references((): AnyPgColumn => gosini.id),
  generation: integer("generation").notNull().default(0),
  bornAt: timestamp("born_at", { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});

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
