import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { gosinoId } from "./self.js";

// Time series of the homeostasis engine state (PROGETTO §5.3): a snapshot on
// every label transition and every 15 minutes.
export const psycheSnapshots = pgTable(
  "psyche_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: gosinoId(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    vars: jsonb("vars").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    index("psyche_snapshots_ts_idx").on(table.ts),
    // la serie delle 48 ore del pannello è per esemplare, non per server
    index("psyche_snapshots_gosino_ts_idx").on(table.gosinoId, table.ts.desc()),
  ],
);
