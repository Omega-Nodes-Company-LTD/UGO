import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient, runMigrations, type DbClient } from "@ugo/db";

/**
 * Boot against a database nobody has migrated — the state a fresh server is
 * always in. This is the failure the first real deploy hit: soul crash-looped
 * on a missing table because the migration step lived in the platform's
 * configuration instead of in the program.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  db = createDbClient(container.getConnectionUri());
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("first boot on an empty database", () => {
  it("migrates itself instead of demanding a step somebody had to remember", async () => {
    const before = await db.execute<{ n: string }>(sql`
      select count(*) as n from information_schema.tables
      where table_schema = 'public' and table_name = 'psyche_baselines'
    `);
    expect(Number(before[0]?.n)).toBe(0);

    await runMigrations(container.getConnectionUri());

    const after = await db.execute<{ n: string }>(sql`
      select count(*) as n from information_schema.tables
      where table_schema = 'public' and table_name = 'psyche_baselines'
    `);
    expect(Number(after[0]?.n)).toBe(1);
    // and the seeded exemplar is there, so the first insert has a valid FK
    const gosini = await db.execute<{ name: string }>(sql`select name from gosini`);
    expect(gosini[0]?.name).toBe("ugo-prime");
  });

  it("is safe to run twice, because a restart is not a special case", async () => {
    await expect(runMigrations(container.getConnectionUri())).resolves.toBeUndefined();
    const gosini = await db.execute<{ n: string }>(sql`select count(*) as n from gosini`);
    expect(Number(gosini[0]?.n)).toBe(1);
  });
});
