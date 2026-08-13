import { sql } from "drizzle-orm";
import { index, pgTable, jsonb, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { beings } from "./beings.js";
import { householdId } from "./households.js";
import { gosinoId } from "./self.js";

export const meetings = pgTable("meetings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  gosinoId: gosinoId(),
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
    /**
     * ADR-048: which house, on the row itself. It used to be reachable only
     * through `meeting_id → meetings.gosino_id → gosini`, and a Row Level
     * Security policy with a two-level subquery stops being obviously correct.
     * Written in the same statement as the segment, always from its meeting.
     */
    householdId: householdId(),
    /** diarization's own label ("SPEAKER_01"): who, before we know who */
    speaker: text("speaker"),
    /**
     * Who actually said it, when the voiceprint matched above the threshold
     * (ADR-016). Set null on erasure: the transcript survives the person, the
     * attribution does not.
     */
    beingId: uuid("being_id").references(() => beings.id, { onDelete: "set null" }),
    t0: real("t0").notNull(),
    t1: real("t1").notNull(),
    // AES-256-GCM ciphertext from Fase 1 (same contract as messages.text)
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (table) => [
    index("transcript_segments_meeting_idx").on(table.meetingId),
    index("transcript_segments_being_idx").on(table.beingId),
    index("transcript_segments_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
