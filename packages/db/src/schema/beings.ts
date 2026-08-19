import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { beingKind } from "./enums.js";
import { accountId } from "./accounts.js";

/**
 * The pack (ADR-014): every being of the house, whatever the species. Not
 * `users` with pets attached — that shape would encode "owner + accessories"
 * forever and would need a migration for every new species.
 *
 * GDPR: erasure anonymizes in place (services/privacy), FKs use "set null" so
 * the biography survives the being.
 *
 * Scoped to a HOUSE, not to an exemplar (ADR-019). The same human living in
 * two houses is two rows, deliberately: a shared row would let one family
 * enumerate another's people, and would correlate two lives that never asked
 * to be correlated. Within one house the row is shared, which is what lets two
 * exemplars hold different opinions about the same person (ADR-014).
 */
export const beings = pgTable(
  "beings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
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
    /** the human this house belongs to; at most one per account */
    isOwner: boolean("is_owner").notNull().default(false),
    aliases: text("aliases").array().notNull().default([]),
    notes: text("notes"),
    /** textual embedding of the being, NOT biometric (see recognition_profiles) */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("beings_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("beings_species_idx").on(table.species),
    index("beings_account_idx").on(table.accountId),
    // the target of the composite foreign keys that make a cross-house bond
    // or relation structurally impossible (ADR-019)
    unique("beings_account_id_uq").on(table.accountId, table.id),
    uniqueIndex("beings_one_owner_per_account_uq")
      .on(table.accountId)
      .where(sql`${table.isOwner}`),
  ],
);
