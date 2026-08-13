import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { beings } from "./beings.js";
import { householdId } from "./households.js";
import { gosini } from "./gosini.js";
import { memories } from "./memories.js";
import { correctionSignal, recognitionModality } from "./enums.js";
import { bytea } from "./types.js";

/**
 * How to recognize a being, per modality (ADR-016).
 *
 * `payload` is AES-256-GCM ciphertext (UGO1) over a float32 centroid — NOT a
 * pgvector column. The two are mutually exclusive: a `vector` holds readable
 * floats, and a voiceprint in the clear is exactly what the encryption
 * requirement protects. Comparison happens in memory after decryption; on a
 * household-sized set an HNSW index would buy nothing.
 *
 * `model` and `dimensions` are explicit because face, voice and text encoders
 * have different sizes: a fixed-width column would pin every modality to the
 * first model ever chosen.
 */
export const recognitionProfiles = pgTable(
  "recognition_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    beingId: uuid("being_id")
      .notNull()
      .references(() => beings.id, { onDelete: "cascade" }),
    /**
     * ADR-048: the house on the row, so a policy does not have to join. The
     * composite key below is what makes it impossible for it to drift from the
     * being's own house — Postgres refuses the pair, we do not remember to.
     */
    householdId: householdId(),
    modality: recognitionModality("modality").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    payload: bytea("payload").notNull(),
    sampleCount: integer("sample_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("recognition_profiles_being_modality_uq").on(table.beingId, table.modality),
    foreignKey({
      columns: [table.householdId, table.beingId],
      foreignColumns: [beings.householdId, beings.id],
      name: "recognition_profiles_household_being_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * Perception, one table for every modality: no raw media, only normalized
 * observations. `being_id` is who it is when we know; `candidate_being_id` is
 * who it might be. Below the confidence threshold UGO does not guess — he
 * treats the being as unknown and asks a trusted human.
 */
export const perceptionEvents = pgTable(
  "perception_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    // text, not an enum: channels are configuration like species (ADR-016)
    modality: text("modality").notNull(),
    beingId: uuid("being_id").references(() => beings.id, { onDelete: "set null" }),
    candidateBeingId: uuid("candidate_being_id").references(() => beings.id, {
      onDelete: "set null",
    }),
    confidence: real("confidence"),
    observed: jsonb("observed").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("perception_events_gosino_occurred_idx").on(table.gosinoId, table.occurredAt.desc()),
    index("perception_events_being_idx").on(table.beingId),
  ],
);

/**
 * How the pack educates UGO. `wrong_name` is the most important signal in the
 * system: recognition is fallible by construction, and this is the channel
 * that corrects it.
 */
export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    /** who is correcting */
    beingId: uuid("being_id").references(() => beings.id, { onDelete: "set null" }),
    /** about whom */
    aboutBeing: uuid("about_being").references(() => beings.id, { onDelete: "set null" }),
    signal: correctionSignal("signal").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("corrections_gosino_created_idx").on(table.gosinoId, table.createdAt.desc())],
);

/** Which beings a memory is about (ADR-014). */
export const memoryBeings = pgTable(
  "memory_beings",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    beingId: uuid("being_id")
      .notNull()
      .references(() => beings.id, { onDelete: "cascade" }),
    /**
     * ADR-048. Reachable before only through the memory and its exemplar — two
     * levels of subquery in a policy. Written by the dream in the same
     * statement as the link, and only between rows of one house (ADR-024).
     */
    householdId: householdId(),
  },
  (table) => [
    index("memory_beings_being_idx").on(table.beingId),
    unique("memory_beings_pk").on(table.memoryId, table.beingId),
    // the being is already pinned to its house, so the pair cannot drift
    foreignKey({
      columns: [table.householdId, table.beingId],
      foreignColumns: [beings.householdId, beings.id],
      name: "memory_beings_household_being_fk",
    }).onDelete("cascade"),
  ],
);
