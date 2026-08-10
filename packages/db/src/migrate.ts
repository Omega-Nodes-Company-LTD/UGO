import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Resolved relative to this module so the same code works from src (tsx),
// dist (production image) and tests — environment parity, no duplicate SQL.
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/**
 * Arbitrary but stable key: two deployments racing on the same database must
 * pick the same lock. Advisory locks live outside transactions and are
 * released automatically if the process dies mid-migration.
 */
const MIGRATION_LOCK_KEY = 8_150_1970;

/**
 * Apply all pending drizzle-kit migrations. The only sanctioned way to touch
 * the schema (CLAUDE.md rule 5).
 *
 * Serialized by a Postgres advisory lock: with zero-downtime redeploys the
 * old and new containers can start migrating at the same instant, and two
 * concurrent runs of the same migration are how schemas get corrupted. The
 * loser simply waits and then finds nothing left to do.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  const db = drizzle(pool);
  try {
    await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
    try {
      await migrate(db, { migrationsFolder });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    }
  } finally {
    await pool.end();
  }
}
