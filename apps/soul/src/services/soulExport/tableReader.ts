import type { DbClient } from "@ugo/db";
import { sql, type SQL } from "drizzle-orm";

/**
 * One table, read through a server-side cursor: memory stays at one batch
 * however large `events` has grown, and the table is read from the
 * transaction's snapshot, so every table in the archive is the same instant.
 *
 * Rows come out of the database already as JSON (`to_jsonb`), which is what
 * makes the reader generic: bytea arrives as `\x…` hex and timestamps as ISO
 * text without a line of per-column code — and dropped columns are removed in
 * SQL, so a vector or a key is never even sent over the wire to this process.
 * Table and cursor names are identifiers validated by the caller against the
 * database's own catalogue, and quoted here.
 */
const BATCH = 500;
let cursorCounter = 0;

export function dropList(columns: readonly string[]): SQL {
  if (columns.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    columns.map((column) => sql`${column}::text`),
    sql`, `,
  )}]`;
}

export async function* readTableRows(
  tx: DbClient,
  table: string,
  where: SQL,
  drop: readonly string[],
): AsyncGenerator<Record<string, unknown>[]> {
  cursorCounter += 1;
  const cursor = sql.identifier(`soul_export_${String(cursorCounter)}`);
  await tx.execute(sql`
    declare ${cursor} no scroll cursor for
    select (to_jsonb(t) - ${dropList(drop)})::text as j
    from ${sql.identifier(table)} t
    where ${where}`);
  try {
    for (;;) {
      const batch = (await tx.execute(sql`fetch forward ${sql.raw(String(BATCH))} from ${cursor}`)) as unknown as {
        j: string;
      }[];
      if (batch.length === 0) return;
      yield batch.map((row) => JSON.parse(row.j) as Record<string, unknown>);
    }
  } finally {
    await tx.execute(sql`close ${cursor}`);
  }
}

export async function countRows(
  tx: DbClient,
  table: string,
  where: SQL,
  nonNullColumn?: string,
): Promise<number> {
  const counted = nonNullColumn === undefined ? sql`count(*)` : sql`count(t.${sql.identifier(nonNullColumn)})`;
  const rows = (await tx.execute(
    sql`select ${counted}::int as n from ${sql.identifier(table)} t where ${where}`,
  )) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}
