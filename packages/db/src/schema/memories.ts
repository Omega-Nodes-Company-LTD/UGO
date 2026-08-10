import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { memoryKind } from "./enums.js";
import { gosinoId } from "./self.js";

// Semantic memory (PROGETTO §5.4): retrieval re-ranks by
// similarity × importance × recency; last_accessed keeps used memories alive.
export const memories = pgTable(
  "memories",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: gosinoId(),
    kind: memoryKind("kind").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    importance: real("importance").notNull().default(0.5),
    lastAccessed: timestamp("last_accessed", { withTimezone: true }),
    sourceRefs: jsonb("source_refs").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("memories_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("memories_kind_idx").on(table.kind),
  ],
);
