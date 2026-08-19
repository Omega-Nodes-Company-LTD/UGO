import { startPostgres } from "@ugo/factories";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient, withAccount, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import { beings, gosini, accounts, memories } from "../../src/schema/index.js";

/**
 * ADR-048: the net under the application scoping.
 *
 * The only test worth writing here is the one that does the wrong thing on
 * purpose — a query with **no** `where account_id` — and checks that the
 * answer is zero rows rather than the neighbours' data. Everything else is
 * already covered by the tests that assert the `where` is there; this asserts
 * what happens the day somebody forgets one.
 *
 * It connects as `ugo_app`, because policies do not apply to the owner of the
 * tables (ADR-019 §75): running this as the migration user would pass while
 * proving nothing at all.
 */

const APP_PASSWORD = "ugo-app-test-password";

let container: StartedPostgreSqlContainer;
/** the owner: migrations, seeding, and the control case */
let owner: DbClient;
/** the application role, the one the policies actually bite */
let app: DbClient;
let casa: string;
let vicini: string;
let nostroRicordo: string;
let loroRicordo: string;

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  owner = createDbClient(pg.url);

  await owner.execute(sql.raw(`ALTER ROLE ugo_app LOGIN PASSWORD '${APP_PASSWORD}'`));
  const appUrl = new URL(pg.url);
  appUrl.username = "ugo_app";
  appUrl.password = APP_PASSWORD;
  app = createDbClient(appUrl.toString());

  const house = async (slug: string): Promise<{ id: string; gosinoId: string }> => {
    const [row] = await owner
      .insert(accounts)
      .values({ slug, name: slug })
      .returning({ id: accounts.id });
    if (row === undefined) throw new Error("no account");
    const [exemplar] = await owner
      .insert(gosini)
      .values({ accountId: row.id, name: `ugo-${slug}` })
      .returning({ id: gosini.id });
    if (exemplar === undefined) throw new Error("no exemplar");
    return { id: row.id, gosinoId: exemplar.id };
  };

  const nostra = await house("casa-rls-nostra");
  const loro = await house("casa-rls-loro");
  casa = nostra.id;
  vicini = loro.id;

  await owner.insert(beings).values([
    { accountId: casa, displayName: "Persona Nostra" },
    { accountId: vicini, displayName: "Persona Loro" },
  ]);
  const written = await owner
    .insert(memories)
    .values([
      { gosinoId: nostra.gosinoId, kind: "fact", text: "la nostra lavatrice perde" },
      { gosinoId: loro.gosinoId, kind: "fact", text: "il loro gatto si chiama Ugo" },
    ])
    .returning({ id: memories.id });
  nostroRicordo = written[0]?.id ?? "";
  loroRicordo = written[1]?.id ?? "";
}, 180_000);

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
  await container.stop();
});

describe("una query che dimentica lo scope", () => {
  it("gives the forgetful reader zero rows, not the neighbours'", async () => {
    // deliberately unscoped: this is the mistake the whole ADR exists for
    const seen = await withAccount(app, casa, async (tx) =>
      tx.select({ name: beings.displayName }).from(beings),
    );
    expect(seen.map((row) => row.name)).toEqual(["Persona Nostra"]);
  });

  it("reaches the exemplar's tables through its house, not around it", async () => {
    const ours = await withAccount(app, casa, async (tx) =>
      tx.select({ text: memories.text }).from(memories),
    );
    expect(ours).toHaveLength(1);
    expect(ours[0]?.text).toContain("lavatrice");

    // and the mirror image, so the test cannot pass by returning nothing
    const theirs = await withAccount(app, vicini, async (tx) =>
      tx.select({ text: memories.text }).from(memories),
    );
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.text).toContain("gatto");
  });

  it("cannot read a neighbour's row even when it knows the id", async () => {
    const byId = await withAccount(app, casa, async (tx) =>
      tx.execute(sql`select id from memories where id = ${loroRicordo}`),
    );
    expect(byId).toHaveLength(0);
    // ours, with the same query, is there
    const own = await withAccount(app, casa, async (tx) =>
      tx.execute(sql`select id from memories where id = ${nostroRicordo}`),
    );
    expect(own).toHaveLength(1);
  });

  it("refuses a write aimed at another house", async () => {
    await expect(
      withAccount(app, casa, async (tx) =>
        tx.insert(beings).values({ accountId: vicini, displayName: "Un Intruso" }),
      ),
    ).rejects.toThrow();
  });

  it("shows nothing at all to a transaction that never said which house", async () => {
    // no `withAccount`: `app.account_id` is unset, and the policy answers
    // "no rows" rather than raising something a caller might be tempted to catch
    const blind = await app.select({ name: beings.displayName }).from(beings);
    expect(blind).toEqual([]);
  });

  it("does not leak between two pooled requests", async () => {
    // the reason it is SET LOCAL: a plain SET would outlive the transaction and
    // the next request on that connection would inherit somebody else's house
    await withAccount(app, vicini, async (tx) =>
      tx.select({ name: beings.displayName }).from(beings),
    );
    const after = await app.select({ name: beings.displayName }).from(beings);
    expect(after).toEqual([]);
  });

  it("still lets the owner run migrations, which is why the role is separate", async () => {
    const all = await owner.select({ name: beings.displayName }).from(beings);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
