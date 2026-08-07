import { z } from "zod";
import { parseEnv } from "@ugo/shared";
import { runMigrations } from "./migrate.js";

// CLI entrypoint for `pnpm db:migrate` (dev) and the production release step.
const env = parseEnv(z.object({ DATABASE_URL: z.url() }));

try {
  await runMigrations(env.DATABASE_URL);
  console.log("migrations applied");
} catch (error) {
  console.error("migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
