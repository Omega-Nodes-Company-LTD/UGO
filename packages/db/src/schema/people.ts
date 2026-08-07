import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";

// GDPR: DELETE on a person propagates irreversible anonymization on linked
// messages/segments (PROGETTO §5.2) — implemented at service level in Fase 1;
// FKs here use "set null" so rows survive the person.
export const people = pgTable(
  "people",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    displayName: text("display_name").notNull(),
    aliases: text("aliases").array().notNull().default([]),
    notes: text("notes"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("people_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
