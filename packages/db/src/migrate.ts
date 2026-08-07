import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Resolved relative to this module so the same code works from src (tsx),
// dist (production image) and tests — environment parity, no duplicate SQL.
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** Apply all pending drizzle-kit migrations. The only sanctioned way to touch the schema. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
