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
  /** the dream's fuzzy hint, in words: "domani mattina", "quando torna" */
  dueHint: text("due_hint"),
  /**
   * ADR-028: the exact moment, when there is one. A reminder the owner asked
   * for ("buttare l'acqua alle 13") is a desire with a clock on it — nullable,
   * because the dream's own desires have no appointment.
   */
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
