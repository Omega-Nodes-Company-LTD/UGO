import { PRIME_ACCOUNT_ID, PRIME_GOSINO_ID, type DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";
import type { TargetCatalogue } from "./catalogue.js";
import { ImportRefusal } from "./errors.js";

/**
 * "Empty" is not "no accounts": every migration seeds the bootstrap house
 * `casa-prime` and its creature `ugo-prime` (ADR-015/019). In the owner's own
 * deployment those ARE the real first house — an export from there carries
 * those very ids — but on a fresh installation they are an untouched shell.
 *
 * So the target is ready when it holds nothing but that seed: exactly the prime
 * house, exactly the prime creature, the one default place and room the
 * migrations give that house, and every other table empty. The shell is then
 * replaced by the imported house, inside the same transaction (the seeded
 * place and room have fixed ids that an export from another migrated database
 * carries too, so they must go as well). If anything else is there — another
 * house, a single message — this is a house, not a shell, and an import never
 * merges into a house.
 *
 * Runs on a connection that sees EVERY house (the database owner): under a
 * row-level-security role with no house declared, "nothing here" would be a
 * false answer.
 */
const SEEDED_FOR_PRIME = ["rooms", "places"] as const;

export async function clearPristineSeed(tx: DbClient, catalogue: TargetCatalogue): Promise<void> {
  const ids = async (table: string): Promise<string[]> =>
    (
      (await tx.execute(sql`select id::text as id from ${sql.identifier(table)}`)) as unknown as {
        id: string;
      }[]
    ).map((row) => row.id);
  const refuse = (what: string): never => {
    throw new ImportRefusal(
      "target-not-empty",
      `this installation already holds a house (${what}): an import never merges`,
    );
  };

  if ((await ids("accounts")).some((id) => id !== PRIME_ACCOUNT_ID)) refuse("accounts");
  if ((await ids("gosini")).some((id) => id !== PRIME_GOSINO_ID)) refuse("gosini");
  const seeded = new Set<string>(SEEDED_FOR_PRIME);
  for (const table of catalogue.columns.keys()) {
    if (table === "accounts" || table === "gosini") continue;
    const foreign = seeded.has(table) ? sql`where account_id <> ${PRIME_ACCOUNT_ID}::uuid` : sql``;
    const found = (await tx.execute(
      sql`select 1 from ${sql.identifier(table)} ${foreign} limit 1`,
    )) as unknown as unknown[];
    if (found.length > 0) refuse(table);
  }

  for (const table of SEEDED_FOR_PRIME) {
    await tx.execute(
      sql`delete from ${sql.identifier(table)} where account_id = ${PRIME_ACCOUNT_ID}::uuid`,
    );
  }
  await tx.execute(sql`delete from gosini where id = ${PRIME_GOSINO_ID}::uuid`);
  await tx.execute(sql`delete from accounts where id = ${PRIME_ACCOUNT_ID}::uuid`);
}
