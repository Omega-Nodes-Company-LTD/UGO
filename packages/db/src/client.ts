import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type DbClient = ReturnType<typeof createDbClient>;

/**
 * Typed Drizzle client over postgres-js. The pool is owned by the caller:
 * close it with `db.$client.end()` on shutdown (and in test afterAll hooks —
 * TESTING_PLAYBOOK §7, no hanging processes).
 */
export function createDbClient(databaseUrl: string): ReturnType<typeof buildClient> {
  return buildClient(databaseUrl);
}

function buildClient(databaseUrl: string) {
  const pool = postgres(databaseUrl, {
    // fail fast on an unreachable database instead of queueing forever
    connect_timeout: 10,
  });
  return drizzle(pool, { schema, casing: "snake_case" });
}
