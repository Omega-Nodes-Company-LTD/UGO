import { readdirSync } from "node:fs";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { MemoryFactory, embeddingFromSeed, startPostgres } from "@ugo/factories";
import { cosineDistance, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import { PRIME_GOSINO_ID, memories } from "../../src/schema/index.js";

// Zero-Mock (TESTING_PLAYBOOK §2): real Postgres via Testcontainers, the same
// pgvector image used by the dev compose (environment parity), migrated with
// the same runMigrations() code production uses.

const EXPECTED_TABLES = [
  "beings",
  "events",
  "messages",
  "memories",
  "psyche_snapshots",
  "meetings",
  "transcript_segments",
  "diary_entries",
  "desires",
  "budget_ledger",
  "gosini",
  "trait_sets",
  "births",
  "feedings",
  "bonds",
  "relations",
  "recognition_profiles",
  "perception_events",
  "corrections",
  "memory_beings",
  "customers",
  "customer_gosini",
  "customer_access_tokens",
  "tickets",
  "customer_messages",
  "customer_repos",
  "customer_documents",
  "customer_mail_accounts",
  "customer_chunks",
  "customer_answer_cache",
] as const;

let container: StartedPostgreSqlContainer;
let dbUrl: string;
let db: DbClient;

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  dbUrl = pg.url;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("migrations on a pristine postgres", () => {
  it("creates every §5.2 table", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    const names = rows.map((row) => row.table_name);
    for (const expected of EXPECTED_TABLES) {
      expect(names).toContain(expected);
    }
  });

  it("enables the pgvector extension", async () => {
    const rows = await db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname = 'vector'`,
    );
    expect(rows).toHaveLength(1);
  });

  // ADR-051/052: the reception's tables are tenant tables like the others —
  // RLS enabled, one account policy each, declared in the hand-written tail
  // of 0016. A table with RLS on and no policy would be mute, not isolated.
  it("gives every reception table its account policy", async () => {
    const receptionTables = [
      "customers",
      "customer_gosini",
      "customer_access_tokens",
      "tickets",
      "customer_messages",
      "customer_repos",
      "customer_documents",
      "customer_mail_accounts",
      "customer_chunks",
      "customer_answer_cache",
    ];
    const rows = await db.execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname from pg_policies where schemaname = 'public'
    `);
    for (const table of receptionTables) {
      expect(
        rows.some((row) => row.tablename === table && row.policyname === `${table}_account`),
        `missing policy on ${table}`,
      ).toBe(true);
    }
    const inList = sql.raw(receptionTables.map((table) => `'${table}'`).join(", "));
    const rls = await db.execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select relname, relrowsecurity from pg_class
      where relname in (${inList})
    `);
    for (const row of rls) {
      expect(row.relrowsecurity, `RLS disabled on ${row.relname}`).toBe(true);
    }
  });

  // ADR-069: the lineage is a account fact behind the wall, and an act, not
  // a record to correct — UPDATE and DELETE are not granted, like the audit log
  it("puts the lineage behind the account wall, append-only for ugo_app", async () => {
    const policies = await db.execute<{ policyname: string }>(sql`
      select policyname from pg_policies where schemaname = 'public' and tablename = 'births'
    `);
    expect(policies.some((row) => row.policyname === "births_account")).toBe(true);

    const grants = await db.execute<{ privilege_type: string }>(sql`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'ugo_app' and table_name = 'births'
    `);
    expect(grants.map((row) => row.privilege_type).sort()).toEqual(["INSERT", "SELECT"]);
  });

  // ADR-072: il cibo è un fatto della casa e un atto, come il lignaggio
  it("puts the meals behind the account wall, append-only for ugo_app", async () => {
    const policies = await db.execute<{ policyname: string }>(sql`
      select policyname from pg_policies where schemaname = 'public' and tablename = 'feedings'
    `);
    expect(policies.some((row) => row.policyname === "feedings_account")).toBe(true);

    const grants = await db.execute<{ privilege_type: string }>(sql`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'ugo_app' and table_name = 'feedings'
    `);
    expect(grants.map((row) => row.privilege_type).sort()).toEqual(["INSERT", "SELECT"]);
  });

  // the reception channel exists in the database, not only in TypeScript
  it("accepts 'ticket' as a message_channel", async () => {
    const rows = await db.execute<{ value: string }>(sql`
      select unnest(enum_range(null::message_channel))::text as value
    `);
    expect(rows.map((row) => row.value)).toContain("ticket");
  });
});

describe("vector round-trip on memories", () => {
  // Transaction-per-test isolation (TESTING_PLAYBOOK §2): writes roll back.
  type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

  async function withRollback(run: (tx: Tx) => Promise<void>): Promise<void> {
    await expect(
      db.transaction(async (tx) => {
        await run(tx);
        throw new Error("__rollback__");
      }),
    ).rejects.toThrow("__rollback__");
  }

  beforeEach(async () => {
    // sanity: the table must be empty at every test start (proves isolation)
    const rows = await db.select({ id: memories.id }).from(memories);
    expect(rows).toHaveLength(0);
  });

  it("stores and reads back a 768-dimension embedding unchanged", async () => {
    await withRollback(async (tx) => {
      // ADR-048 tempo 2: l'esemplare non ha piu' un default, quindi lo si dice.
      // Qui e' sempre quello seminato, l'unico che questi test conoscono.
      const input = MemoryFactory.create({
        gosinoId: PRIME_GOSINO_ID,
        embedding: embeddingFromSeed(42),
      });
      const inserted = await tx.insert(memories).values(input).returning();
      expect(inserted).toHaveLength(1);
      const insertedRow = inserted[0];
      expect(insertedRow).toBeDefined();
      if (insertedRow === undefined) return;
      // UUIDv4 primary key generated by the database
      expect(insertedRow.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );

      const selected = await tx.select().from(memories).where(eq(memories.id, insertedRow.id));
      const row = selected[0];
      expect(row).toBeDefined();
      if (row === undefined) return;
      expect(row.embedding).toHaveLength(768);
      expect(row.text).toBe(input.text);
      // pgvector stores float4: compare with tolerance, element by element
      for (const [i, value] of input.embedding.entries()) {
        expect(row.embedding?.[i]).toBeCloseTo(value, 5);
      }
    });
  });

  it("ranks the closest memory first under cosine distance", async () => {
    await withRollback(async (tx) => {
      const target = embeddingFromSeed(1);
      const nearTarget = target.map((v, i) => (i === 0 ? v + 0.001 : v));
      const needle = MemoryFactory.create({
        gosinoId: PRIME_GOSINO_ID,
        embedding: nearTarget,
      });
      const noise = Array.from({ length: 5 }, (_, i) =>
        MemoryFactory.create({
          gosinoId: PRIME_GOSINO_ID,
          embedding: embeddingFromSeed(1000 + i),
        }),
      );
      await tx.insert(memories).values([needle, ...noise]);

      const ranked = await tx
        .select({ text: memories.text })
        .from(memories)
        .orderBy(cosineDistance(memories.embedding, target))
        .limit(3);
      expect(ranked[0]?.text).toBe(needle.text);
    });
  });

  /**
   * ADR-048 tempo 2. Questo e' il difetto che il gruppo 5 chiude, e va provato
   * al contrario di tutti gli altri: non «lo scope funziona» ma «dimenticarlo
   * **fallisce**». Finche' il `DEFAULT` c'era, questa insert riusciva e la riga
   * finiva sull'esemplare seminato — cioe' nella casa di qualcun altro, in
   * silenzio. Un test che asserisse le righe non l'avrebbe mai visto: le righe
   * c'erano, ed erano plausibili.
   */
  it("refuses a memory that does not say whose it is", async () => {
    await withRollback(async (tx) => {
      let caught: unknown;
      try {
        await tx.execute(sql`
          insert into memories (kind, text, importance)
          values ('fact', 'un ricordo senza padrone', 0.5)
        `);
      } catch (error) {
        caught = error;
      }
      const messages: string[] = [];
      for (let err = caught; err instanceof Error; err = err.cause) {
        messages.push(err.message);
      }
      // non un errore qualunque: proprio il NOT NULL su `gosino_id`
      expect(messages.join(" | ")).toMatch(/null value in column "gosino_id"/);
    });

    // e la casa seminata non ha guadagnato una riga che non e' sua
    const rows = await db.select({ id: memories.id }).from(memories);
    expect(rows).toHaveLength(0);
  });

  it("rejects a kind outside the memory_kind enum", async () => {
    await withRollback(async (tx) => {
      let caught: unknown;
      try {
        // `gosino_id` esplicito: senza, il NOT NULL di ADR-048 tempo 2
        // solleverebbe *un* errore, e questo test asserisce **quale**.
        await tx.execute(sql`
          insert into memories (gosino_id, kind, text, importance)
          values (${PRIME_GOSINO_ID}, 'daydream', 'not a valid kind', 0.5)
        `);
      } catch (error) {
        caught = error;
      }
      // drizzle wraps the postgres error: walk the cause chain for the real one
      const messages: string[] = [];
      for (let err = caught; err instanceof Error; err = err.cause) {
        messages.push(err.message);
      }
      expect(messages.join(" | ")).toMatch(/invalid input value for enum memory_kind/);
    });
  });
});

describe("migration concurrency (zero-downtime redeploys)", () => {
  it("serializes concurrent runs instead of corrupting the schema", async () => {
    // both containers boot at the same instant and both try to migrate
    const results = await Promise.allSettled([
      runMigrations(dbUrl),
      runMigrations(dbUrl),
      runMigrations(dbUrl),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);

    // the schema survived: still exactly one of each table, no duplicates
    const rows = await db.execute<{ table_name: string; n: string }>(sql`
      select table_name, count(*) as n from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      group by table_name
    `);
    expect(rows.every((row) => Number(row.n) === 1)).toBe(true);
    const applied = await db.execute<{ n: string }>(
      sql`select count(*) as n from drizzle.__drizzle_migrations`,
    );
    // derived from disk, not hardcoded: the invariant is "each migration once",
    // and it must keep holding as migrations are added
    const onDisk = readdirSync(new URL("../../drizzle", import.meta.url)).filter((name) =>
      name.endsWith(".sql"),
    ).length;
    expect(Number(applied[0]?.n)).toBe(onDisk);
  });
});
