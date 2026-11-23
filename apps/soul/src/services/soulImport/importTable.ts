import type { TableStream } from "@ugo/shared";
import { sql } from "drizzle-orm";
import { TABLES } from "../soulExport/policyTables.js";
import type { TargetCatalogue } from "./catalogue.js";
import { embedBatch, type Pending } from "./embedBatch.js";
import { ImportRefusal } from "./errors.js";
import { insertRows, restoreSelfReferences } from "./insertBatch.js";
import { jsonLines } from "./lines.js";
import { prepareRow, type Deferred, type PrepareContext } from "./prepareRow.js";
import type { ImportState, TableReport } from "./types.js";

const BATCH = 500;

async function drain(data: AsyncIterable<Buffer>): Promise<void> {
  for await (const piece of data) void piece;
}

function dependenciesOf(catalogue: TargetCatalogue, table: string): Set<string> {
  return new Set(
    catalogue.edges.filter(([from, to]) => from === table && to !== table).map(([, to]) => to),
  );
}

/** Postgres says "23503"; drizzle may wrap the driver's error, so look through the causes. */
function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    if ((current as { code?: unknown }).code === "23503") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * One table of the archive into this database. Tables arrive in foreign-key
 * order (the writer sorts them), so rows can be inserted as they stream: the
 * only state kept is the primary keys of tables something points at, to tell a
 * reference to a missing row from one to a present row.
 */
export async function importTable(state: ImportState, stream: TableStream): Promise<void> {
  const table = stream.table;
  const policy = TABLES[table];
  if (policy === undefined || policy.omit !== undefined) {
    throw new ImportRefusal("unknown-table", `table ${table} has no business being in an archive`);
  }
  const columns = state.catalogue.columns.get(table);
  if (columns === undefined) {
    state.report.ignoredTables.push(table);
    await drain(stream.data);
    return;
  }
  if (table !== "accounts" && state.accountId === undefined) {
    throw new ImportRefusal("no-house", "the archive must start with the house");
  }
  const late = state.expected.get(table);
  if (late !== undefined) {
    throw new ImportRefusal("table-order", `table ${late} arrived before ${table}, which it references`);
  }
  for (const dependency of dependenciesOf(state.catalogue, table)) {
    if (!state.seen.has(dependency)) state.expected.set(dependency, table);
  }
  state.seen.add(table);
  // an empty table needs no vectors: the refusal waits for the first real row
  const cannotEmbed = state.deps.embedderFor === undefined || state.options.skipEmbeddings === true;
  const needsVectors = policy.embed?.required === true && cannotEmbed;

  const context: PrepareContext = {
    table,
    columns,
    foreignKeys: state.catalogue.foreignKeys.get(table) ?? new Map<string, string>(),
    selfReferences: state.catalogue.selfReferences.get(table) ?? new Set<string>(),
    known: state.known,
    masterKey: state.deps.masterKey,
    policy,
  };
  const tracked = state.catalogue.referencedTables.has(table)
    ? (state.known.get(table) ?? new Set<string>())
    : undefined;
  if (tracked !== undefined) state.known.set(table, tracked);

  const result: TableReport = { table, inserted: 0, skipped: 0 };
  const deferred: Deferred[] = [];
  const nulled = new Map<string, number>();
  const ignored = new Set<string>();
  let batch: Pending[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await embedBatch(state, table, batch);
    try {
      await insertRows(state.tx, table, batch.map((item) => item.row));
    } catch (error) {
      // the driver's message would quote key values: say what it means instead
      if (isForeignKeyViolation(error)) {
        throw new ImportRefusal(
          "table-order",
          `table ${table}: a reference cannot be satisfied (order, or rows missing from the archive)`,
        );
      }
      throw error;
    }
    result.inserted += batch.length;
    for (const item of batch) {
      const id = item.row.id;
      if (typeof id !== "string") continue;
      tracked?.add(id);
      if (table === "gosini") state.report.gosinoIds.push(id);
    }
    batch = [];
  };

  for await (const raw of jsonLines(stream.data)) {
    if (needsVectors) {
      throw new ImportRefusal("needs-embedder", `table ${table} cannot be imported without recomputing its vectors`);
    }
    if (table === "accounts" && state.accountId === undefined) {
      const id = raw.id;
      if (typeof id !== "string") throw new ImportRefusal("no-house", "the house row has no id");
      state.accountId = id;
      await state.tx.execute(sql`select set_config('app.account_id', ${id}, true)`);
    }
    const prepared = prepareRow(raw, context);
    if (prepared.kind === "skipped") {
      result.skipped += 1;
      continue;
    }
    for (const column of prepared.nulled) nulled.set(column, (nulled.get(column) ?? 0) + 1);
    for (const column of prepared.ignored) ignored.add(column);
    deferred.push(...prepared.deferred);
    batch.push({ raw, row: prepared.row });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  // second pass for a table that points at itself, now that every row exists
  for (const column of state.catalogue.selfReferences.get(table) ?? []) {
    const mine = deferred.filter((d) => d.column === column);
    const restorable = mine.filter((d) => tracked?.has(d.value) === true);
    await restoreSelfReferences(state.tx, table, column, restorable);
    if (mine.length > restorable.length) {
      nulled.set(column, (nulled.get(column) ?? 0) + mine.length - restorable.length);
    }
  }
  state.report.tables.push(result);
  for (const [column, rows] of nulled) state.report.nulledReferences.push({ table, column, rows });
  for (const column of ignored) state.report.ignoredColumns.push({ table, column });
}
