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
  const local = process.env.UGO_TEST_PG_URL;
  if (local !== undefined && local !== "") return startOnLocalServer(local);
  const container = await new PostgreSqlContainer(IMAGE).start();
  return { container, url: container.getConnectionUri() };
}

/**
 * Il ripiego per gli ambienti senza Docker (sandbox remote): un server
 * Postgres 16 + pgvector GIÀ ACCESO, dichiarato in `UGO_TEST_PG_URL` con un
 * ruolo che può creare database. Ogni chiamata crea un database usa-e-getta —
 * l'isolamento che il container dava col processo, qui lo dà il database — e
 * `stop()` lo butta via.
 *
 * Il cast è brutto e dichiarato: dei container i test usano solo `stop()`
 * (l'URI viaggia in `url`), e cambiare il tipo di `PostgresHandle` vorrebbe
 * dire toccare ogni file di test per un ambiente che la CI non usa. Se un
 * giorno un test chiama altro che `stop()`, il fallimento sarà rumoroso, non
 * silenzioso.
 */
async function startOnLocalServer(serverUrl: string): Promise<PostgresHandle> {
  const { default: postgres } = await import("postgres");
  const dbName = `ugo_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(serverUrl, { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const url = new URL(serverUrl);
  url.pathname = `/${dbName}`;
  const stop = async (): Promise<void> => {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  };
  return {
    container: { stop } as unknown as StartedPostgreSqlContainer,
    url: url.toString(),
  };
}
