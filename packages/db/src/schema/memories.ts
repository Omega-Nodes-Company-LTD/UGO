import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { memoryKind } from "./enums.js";
import { gosinoId } from "./self.js";
import { tsvector } from "./types.js";

// Semantic memory (PROGETTO §5.4): retrieval re-ranks by
// similarity × importance × recency; last_accessed keeps used memories alive.
//
// Facts have a life span. Without one, "Ivan è il corriere DHL" stays as true
// in three years as it was the day it was learned, and comes back out of the
// vector index whenever it happens to be the closest match — because nothing
// in a similarity score knows that a fact stopped being true.
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
    /**
     * Since when the fact held. Usually the day it was learned, but a fact can
     * be recorded late ("da marzo lavora a Milano") and the difference matters
     * when two memories disagree.
     */
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    /**
     * When it stopped being true. Set instead of deleting: what UGO used to
     * believe is part of his biography, and a memory that vanishes cannot
     * explain why he said something last month.
     */
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    /** in the owner's words: "si è trasferito", "non era vero" */
    invalidatedReason: text("invalidated_reason"),
    /** the memory that took its place, when there is one */
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Lexical index over the same text (ADR-022). Two configurations in one
     * vector: `italian` stems and drops stopwords, which is right for ordinary
     * sentences and wrong for «Ferretti» or «GK492NR»; `simple` keeps every
     * token whole. Weighted A and B so a stemmed match still outranks a raw one.
     *
     * Generated, not maintained by a trigger, and the difference is a privacy
     * property rather than a preference: `ForgetService.redactMemories`
     * rewrites `text` during erasure, and a trigger that someone disabled would
     * leave the erased name inside the index, findable. A STORED generated
     * column cannot diverge from its row.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('italian', coalesce("text", '')), 'A') || setweight(to_tsvector('simple', coalesce("text", '')), 'B')`,
    ),
  },
  (table) => [
    index("memories_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("memories_kind_idx").on(table.kind),
    // retrieval asks for the living ones on every single turn
    index("memories_alive_idx").on(table.gosinoId, table.invalidatedAt),
    index("memories_search_gin_idx").using("gin", table.searchVector),
  ],
);
