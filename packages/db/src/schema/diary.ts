import { sql } from "drizzle-orm";
import { date, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { desireStatus } from "./enums.js";
import { gosinoId } from "./self.js";

// Products of the night job (PROGETTO §5.6): diary and desires.
export const diaryEntries = pgTable("diary_entries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  gosinoId: gosinoId(),
  date: date("date").notNull().unique(),
  text: text("text").notNull(),
  moodSummary: jsonb("mood_summary").notNull().default({}),
});

// A desire is an intention that must survive until tomorrow: it lives in the
// database, not in a prompt context (docs/ARCHITECTURE.md §6.4).
export const desires = pgTable("desires", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  gosinoId: gosinoId(),
  text: text("text").notNull(),
  status: desireStatus("status").notNull().default("pending"),
  dueHint: text("due_hint"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
