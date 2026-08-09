import { pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

// ADR-012: adaptive psyche baselines live in Postgres (lo stato è la
// creatura, ADR-005). The night job nudges them ±0.02 within safety clamps;
// the pure engine receives them as overrides and stays I/O-free.
export const psycheBaselines = pgTable("psyche_baselines", {
  variable: text("variable").primaryKey(),
  baseline: real("baseline").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
