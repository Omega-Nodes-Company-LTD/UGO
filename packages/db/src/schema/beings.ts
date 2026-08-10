import { sql } from "drizzle-orm";
import { boolean, date, index, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { beingKind } from "./enums.js";

/**
 * The pack (ADR-014): every being of the house, whatever the species. Not
 * `users` with pets attached — that shape would encode "owner + accessories"
 * forever and would need a migration for every new species.
 *
 * GDPR: erasure anonymizes in place (services/privacy), FKs use "set null" so
 * the biography survives the being.
 */
export const beings = pgTable(
  "beings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    displayName: text("display_name").notNull(),
    // deliberately text, not an enum: adding a species must not need a migration
    species: text("species").notNull().default("human"),
    kind: beingKind("kind").notNull().default("resident"),
    /** seniority in the pack — UGO is the newcomer, and it shows in his tone */
    arrivalAt: date("arrival_at"),
    /** protections applied UPSTREAM of the pipeline, never as a late filter */
    isMinor: boolean("is_minor").notNull().default(false),
    noVision: boolean("no_vision").notNull().default(false),
    noAudio: boolean("no_audio").notNull().default(false),
    aliases: text("aliases").array().notNull().default([]),
    notes: text("notes"),
    /** textual embedding of the being, NOT biometric (see recognition_profiles) */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("beings_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("beings_species_idx").on(table.species),
  ],
);
