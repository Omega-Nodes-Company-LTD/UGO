import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";

/**
 * Rows in, by Postgres's own hand. `jsonb_populate_recordset` turns each JSON
 * object back into a row of the table using the column types' **input
 * functions** — so arrays become arrays, `\x…` becomes bytea, ISO strings
 * become timestamps and `[0.1, …]` becomes a vector, with no per-type code
 * here that could drift from the schema.
 *
 * Only the named columns are inserted, so a column the archive does not carry
 * (dropped on purpose: a key, a vector) takes its DEFAULT instead of NULL —
 * which is what keeps NOT NULL columns like `accounts.daily_budget_usd` valid.
 *
 * Identifiers come from the target's own catalogue (`readCatalogue`) and are
 * quoted; values travel as one bound JSON parameter, never as SQL text.
 */
export async function insertRows(
  tx: DbClient,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const list = sql.join(
    columns.map((column) => sql.identifier(column)),
    sql`, `,
  );
  await tx.execute(sql`
    insert into ${sql.identifier(table)} (${list})
    select ${list}
    from jsonb_populate_recordset(null::${sql.identifier(table)}, ${JSON.stringify(rows)}::jsonb)`);
}

/** Second pass for a table that points at itself, once every row exists. */
export async function restoreSelfReferences(
  tx: DbClient,
  table: string,
  column: string,
  items: readonly { id: string; value: string }[],
): Promise<number> {
  if (items.length === 0) return 0;
  const payload = JSON.stringify(items.map((item) => ({ id: item.id, v: item.value })));
  await tx.execute(sql`
    update ${sql.identifier(table)} as t set ${sql.identifier(column)} = x.v
    from jsonb_to_recordset(${payload}::jsonb) as x(id uuid, v uuid)
    where t.id = x.id`);
  return items.length;
}
