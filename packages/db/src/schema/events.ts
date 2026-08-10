import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { eventSource } from "./enums.js";
import { gosinoId } from "./self.js";

// Append-only episodic memory (PROGETTO §5.4): events are never updated,
// only compacted by the night job.
export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: gosinoId(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    source: eventSource("source").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
  },
  (table) => [index("events_ts_idx").on(table.ts)],
);
