import type { DbClient } from "@ugo/db";
import type { SoulManifest } from "@ugo/shared";
import { sql, type SQL } from "drizzle-orm";
import { UnclassifiedError, type TablePolicy } from "./policy.js";
import { TABLES } from "./policyTables.js";
import { orderByForeignKeys } from "./order.js";
import { scopeFor, type ExportScope } from "./scope.js";
import { countRows } from "./tableReader.js";

type Omission = SoulManifest["omissions"][number];

export interface PlannedTable {
  table: string;
  policy: TablePolicy;
  where: SQL;
  /** columns removed in SQL before the row leaves the database */
  drop: readonly string[];
}

export interface ExportPlan {
  included: PlannedTable[];
  omissions: Omission[];
}

interface ColumnInfo {
  table_name: string;
  column_name: string;
  udt_name: string;
}

const SPECIAL_TYPES = new Set(["bytea", "vector", "tsvector"]);

async function readCatalogue(tx: DbClient): Promise<Map<string, ColumnInfo[]>> {
  const rows = (await tx.execute(sql`
    select table_name, column_name, udt_name
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position`)) as unknown as ColumnInfo[];
  const byTable = new Map<string, ColumnInfo[]>();
  for (const row of rows) byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row]);
  return byTable;
}

async function readForeignKeys(tx: DbClient): Promise<[string, string][]> {
  const rows = (await tx.execute(sql`
    select c.conrelid::regclass::text as src, c.confrelid::regclass::text as dst
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)) as unknown as {
    src: string;
    dst: string;
  }[];
  return rows.map((row) => [row.src, row.dst]);
}

/**
 * Decides, before a single row is read, what the archive will contain — and
 * stops if the database holds anything the policy has not seen. Opaque column
 * types (`bytea`, `vector`, `tsvector`) must be named in the policy: they are
 * where keys, biometrics and embeddings live, so "exported by default" is the
 * one wrong answer for them.
 */
export async function planExport(tx: DbClient, scope: ExportScope): Promise<ExportPlan> {
  const catalogue = await readCatalogue(tx);
  const included: PlannedTable[] = [];
  const omissions: Omission[] = [];

  for (const [table, columns] of [...catalogue.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const policy = TABLES[table];
    if (policy === undefined) throw new UnclassifiedError(`table ${table}`);
    const names = new Set(columns.map((c) => c.column_name));
    const where = scopeFor(table, names, scope, policy);
    if (where === undefined) throw new UnclassifiedError(`table ${table} (no account or creature column)`);

    if (policy.omit !== undefined) {
      omissions.push({
        category: policy.omit.category,
        table,
        reason: policy.omit.reason,
        count: await countRows(tx, table, where),
      });
      continue;
    }

    const declared = new Set([
      ...Object.keys(policy.drop ?? {}),
      ...(policy.publicBytes ?? []),
    ]);
    for (const column of columns) {
      if (SPECIAL_TYPES.has(column.udt_name) && !declared.has(column.column_name)) {
        throw new UnclassifiedError(`column ${table}.${column.column_name} (${column.udt_name})`);
      }
    }
    for (const column of policy.encrypted ?? []) {
      if (!names.has(column)) throw new UnclassifiedError(`encrypted column ${table}.${column} (missing)`);
    }

    for (const [column, why] of Object.entries(policy.drop ?? {})) {
      if (!names.has(column)) continue; // a policy ahead of its migration is harmless
      omissions.push({
        category: why.category,
        table,
        column,
        reason: why.reason,
        count: await countRows(tx, table, where, column),
      });
    }
    if (policy.mediaColumn !== undefined) {
      // a declared media column that does not exist would silently drop an
      // omission from the manifest: stop instead
      if (!names.has(policy.mediaColumn)) {
        throw new UnclassifiedError(`media column ${table}.${policy.mediaColumn} (missing)`);
      }
      omissions.push({
        category: "media-bytes",
        table,
        column: policy.mediaColumn,
        reason: "il file sta nell'archivio di oggetti della casa ospitante: la riga viaggia, i byte non (ancora)",
        count: await countRows(tx, table, where, policy.mediaColumn),
      });
    }
    included.push({ table, policy, where, drop: Object.keys(policy.drop ?? {}).filter((c) => names.has(c)) });
  }
  // foreign-key order, so the importer can stream (see order.ts)
  const order = orderByForeignKeys(
    included.map((planned) => planned.table),
    await readForeignKeys(tx),
  );
  included.sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table));
  return { included, omissions };
}
