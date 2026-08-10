import { pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { gosinoId } from "./self.js";

// ADR-012: adaptive psyche baselines live in Postgres (lo stato è la
// creatura, ADR-005). The night job nudges them ±0.02 within safety clamps;
// the pure engine receives them as overrides and stays I/O-free.
// The baseline is per exemplar (ADR-015): two UGOs living different weeks
// must be allowed to settle on different moods.
export const psycheBaselines = pgTable(
  "psyche_baselines",
  {
    gosinoId: gosinoId(),
    variable: text("variable").notNull(),
    baseline: real("baseline").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.gosinoId, table.variable] })],
);
