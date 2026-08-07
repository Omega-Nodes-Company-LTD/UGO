import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Time series of the homeostasis engine state (PROGETTO §5.3): a snapshot on
// every label transition and every 15 minutes.
export const psycheSnapshots = pgTable(
  "psyche_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    vars: jsonb("vars").notNull(),
    label: text("label").notNull(),
  },
  (table) => [index("psyche_snapshots_ts_idx").on(table.ts)],
);
