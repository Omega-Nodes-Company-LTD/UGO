import { beings, gosini, accounts, type DbClient } from "@ugo/db";
import { generateDataKey, wrapDataKey } from "@ugo/shared";

/**
 * One way to make a house (ADR-019). There were three, drifting apart: the
 * tenancy suite wrapped a real DEK, the peer suite skipped it, and the Python
 * ingest test wrote raw SQL. Phase 2 touches every route and every service, so
 * the setup that proves isolation has to be the same setup everywhere — a test
 * that builds its tenant differently from production proves nothing about
 * production.
 *
 * It lives here rather than in `@ugo/factories` because it needs `@ugo/db`,
 * and `@ugo/db` already depends on that package for its own tests: importing
 * it back would close a cycle in the build graph.
 */

export interface TestHouse {
  id: string;
  slug: string;
  /** the first exemplar, born with the house */
  gosinoId: string;
  /** the house's own data key, in the clear — tests need to decrypt with it */
  dataKey: Buffer;
}

export interface CreateHouseOptions {
  name?: string;
  /**
   * When given, the DEK is stored wrapped under it, exactly as production
   * does. Leave it out when the test only needs a tenant boundary and never
   * reads `wrapped_data_key`.
   */
  masterKey?: Buffer;
}

export async function createHouse(
  db: DbClient,
  slug: string,
  options: CreateHouseOptions = {},
): Promise<TestHouse> {
  const dataKey = generateDataKey();
  const [house] = await db
    .insert(accounts)
    .values({
      slug,
      name: options.name ?? slug,
      ...(options.masterKey === undefined
        ? {}
        : { wrappedDataKey: wrapDataKey(dataKey, options.masterKey) }),
    })
    .returning({ id: accounts.id });
  if (house === undefined) throw new Error(`account ${slug} was not created`);

  const [exemplar] = await db
    .insert(gosini)
    .values({ accountId: house.id, name: `ugo-${slug}`, generation: 0 })
    .returning({ id: gosini.id });
  if (exemplar === undefined) throw new Error(`exemplar for ${slug} was not created`);

  return { id: house.id, slug, gosinoId: exemplar.id, dataKey };
}

/** A second (third, fourth) exemplar under the same roof — the normal case. */
export async function addGosino(db: DbClient, house: TestHouse, name: string): Promise<string> {
  const [exemplar] = await db
    .insert(gosini)
    .values({ accountId: house.id, name, generation: 0 })
    .returning({ id: gosini.id });
  if (exemplar === undefined) throw new Error(`exemplar ${name} was not created`);
  return exemplar.id;
}

export async function addBeing(
  db: DbClient,
  house: TestHouse,
  displayName: string,
): Promise<string> {
  const [being] = await db
    .insert(beings)
    .values({ accountId: house.id, displayName })
    .returning({ id: beings.id });
  if (being === undefined) throw new Error(`being ${displayName} was not created`);
  return being.id;
}
