import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";
import type { ColumnInfo } from "./prepareRow.js";

/**
 * What THIS database looks like, read from its own catalogue — not from the
 * archive and not from the code. An archive is written by another installation
 * at another point of the schema; what it may contain is decided here.
 */
export interface TargetCatalogue {
  columns: Map<string, Map<string, ColumnInfo>>;
  /** single-column foreign keys: table → column → referenced table */
  foreignKeys: Map<string, Map<string, string>>;
  selfReferences: Map<string, Set<string>>;
  /** tables something points at: their primary keys are tracked while importing */
  referencedTables: Set<string>;
  /** `[table, referencedTable]`, composite keys included (they decide the order) */
  edges: [string, string][];
}

export async function readCatalogue(tx: DbClient): Promise<TargetCatalogue> {
  const columnRows = (await tx.execute(sql`
    select table_name, column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'`)) as unknown as {
    table_name: string;
    column_name: string;
    is_nullable: string;
  }[];
  const fkRows = (await tx.execute(sql`
    select c.conrelid::regclass::text as src,
           c.confrelid::regclass::text as dst,
           array_length(c.conkey, 1) as width,
           (select a.attname from pg_attribute a
             where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) as col
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)) as unknown as {
    src: string;
    dst: string;
    width: number;
    col: string;
  }[];

  const columns = new Map<string, Map<string, ColumnInfo>>();
  for (const row of columnRows) {
    const table = columns.get(row.table_name) ?? new Map<string, ColumnInfo>();
    table.set(row.column_name, { name: row.column_name, nullable: row.is_nullable === "YES" });
    columns.set(row.table_name, table);
  }

  const foreignKeys = new Map<string, Map<string, string>>();
  const selfReferences = new Map<string, Set<string>>();
  const referencedTables = new Set<string>();
  const edges: [string, string][] = [];
  for (const fk of fkRows) {
    edges.push([fk.src, fk.dst]);
    if (fk.width !== 1) continue;
    referencedTables.add(fk.dst);
    if (fk.src === fk.dst) {
      selfReferences.set(fk.src, (selfReferences.get(fk.src) ?? new Set<string>()).add(fk.col));
    } else {
      foreignKeys.set(fk.src, (foreignKeys.get(fk.src) ?? new Map<string, string>()).set(fk.col, fk.dst));
    }
  }
  return { columns, foreignKeys, selfReferences, referencedTables, edges };
}
