import { sql } from "drizzle-orm";
import { index, pgTable, jsonb, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";

export const meetings = pgTable("meetings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  platform: text("platform").notNull(),
  title: text("title"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  participants: jsonb("participants").notNull().default([]),
  audioUri: text("audio_uri"),
  status: text("status").notNull().default("pending"),
});

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speaker: text("speaker"),
    t0: real("t0").notNull(),
    t1: real("t1").notNull(),
    // AES-256-GCM ciphertext from Fase 1 (same contract as messages.text)
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (table) => [
    index("transcript_segments_meeting_idx").on(table.meetingId),
    index("transcript_segments_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
