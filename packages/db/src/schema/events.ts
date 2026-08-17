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
  (table) => [
    index("events_ts_idx").on(table.ts),
    // Composto, e in quest'ordine: ogni lettura filtra per esemplare e ordina
    // per tempo (`askedToGoOutRecently`, il sogno, la ruminazione), e la
    // politica RLS valuta `gosino_id` su OGNI riga che tocca. Con il solo
    // indice sul tempo si finiva in scansione sequenziale a ogni giro, e il
    // profilo lo attribuiva al «RLS filter» invece che all'indice mancante.
    index("events_gosino_ts_idx").on(table.gosinoId, table.ts.desc()),
  ],
);
