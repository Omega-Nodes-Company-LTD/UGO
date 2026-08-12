import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * The one Postgres every integration test starts from (Zero-Mock, CLAUDE.md
 * rule 1). The image tag lived in twelve files before this helper; it lives
 * here now, because ADR-019 phase 2 changes what a fresh database must contain
 * (an application role beside the owner) and twelve copies of that is twelve
 * chances to forget one.
 *
 * Migrations are deliberately NOT applied here: `runMigrations` belongs to
 * `@ugo/db`, which already depends on this package for its own tests. Importing
 * it back would close a cycle in the build graph. Callers do the two explicit
 * lines instead:
 *
 * ```ts
 * const pg = await startPostgres();
 * await runMigrations(pg.url);
 * const db = createDbClient(pg.url);
 * ```
 */

const IMAGE = "pgvector/pgvector:pg16";

export interface PostgresHandle {
  container: StartedPostgreSqlContainer;
  /** Connection URI for the database owner — the role migrations run as. */
  url: string;
}

export async function startPostgres(): Promise<PostgresHandle> {
  const container = await new PostgreSqlContainer(IMAGE).start();
  return { container, url: container.getConnectionUri() };
}
