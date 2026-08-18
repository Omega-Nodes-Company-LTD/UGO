import { sql } from "drizzle-orm";
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

/**
 * Runs `work` inside a transaction that has declared which house it is about
 * (ADR-048). This is the only place `app.account_id` is ever set, and the
 * only thing the Row Level Security policies read.
 *
 * **`SET LOCAL`, not `SET`.** The pool reuses connections: a plain `SET` would
 * outlive the request and the next one would inherit the previous caller's
 * house — which is precisely the failure RLS exists to make impossible. `SET
 * LOCAL` is undone when the transaction ends, whether it commits or not.
 *
 * The value is passed as a bound parameter rather than interpolated: it
 * arrives from a request, and `set_config` takes it as data instead of as SQL.
 */
export async function withAccount<T>(
  db: DbClient,
  accountId: string,
  work: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`);
    return work(tx as unknown as DbClient);
  });
}
