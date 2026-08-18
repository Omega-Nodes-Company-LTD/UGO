import { sql } from "drizzle-orm";
import { date, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { desireKind, desireStatus } from "./enums.js";
import { gosinoId } from "./self.js";

// Products of the night job (PROGETTO §5.6): diary and desires.
export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: gosinoId(),
    date: date("date").notNull(),
    text: text("text").notNull(),
    moodSummary: jsonb("mood_summary").notNull().default({}),
  },
  // ADR-048: the date used to be globally unique, so the second exemplar to
  // dream overwrote the first one's diary — `reflect.py` writes
  // `on conflict (date) do update`. Between two houses it did it across
  // families.
  (table) => [unique("diary_entries_gosino_date_uq").on(table.gosinoId, table.date)],
);

// A desire is an intention that must survive until tomorrow: it lives in the
// database, not in a prompt context (docs/ARCHITECTURE.md §6.4).
export const desires = pgTable("desires", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  gosinoId: gosinoId(),
  text: text("text").notNull(),
  status: desireStatus("status").notNull().default("pending"),
  /**
   * ADR-078: che cosa è questa riga. Il default è `desiderio` perché è ciò
   * che erano tutte prima — e le righe che avevano già un'ora sopra sono
   * promemoria, che la migrazione ricuce all'indietro invece di lasciarle
   * mentire.
   *
   * Serve perché adesso questa tabella ha **due consumatori**: l'iniziativa,
   * che sceglie il momento buono, e il timer, che non sceglie niente e suona
   * in orario. Senza il tipo, il primo dei due avrebbe letto la sveglia
   * dell'altro e l'avrebbe detta con le parole sbagliate, in ritardo.
   */
  kind: desireKind("kind").notNull().default("desiderio"),
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
