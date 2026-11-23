import { encryptText, generateDataKey, wrapDataKey } from "@ugo/shared";
import type { TablePolicy } from "../soulExport/policy.js";

/**
 * One archive row → one row for THIS installation (ADR-132, MKT-10.5).
 *
 * The archive is plaintext rows from another database; this is where they stop
 * being that. Pure on purpose: every rule below is a place a house can be
 * corrupted, and each is asserted without a database.
 *
 *  1. columns the target does not have are dropped (and counted: an importer
 *     that quietly discards data is the bug ADR-089 existed to end);
 *  2. a reference to a row the archive did not carry — a parent creature who
 *     was not exported, a being who was forgotten — becomes NULL if the column
 *     allows it, and otherwise the row is skipped; both are reported;
 *  3. a table's reference to itself is emptied for the first insert and
 *     remembered, to be restored once every row exists;
 *  4. ciphertext columns are encrypted under THIS installation's key — except
 *     the ones the runtime keeps in the clear (memories, ADR-091);
 *  5. what belongs to the installation and not to the creature is set here:
 *     the house's data key, the creature's inner key, and no rights to found
 *     or breed (rule 14), no meeting other creatures without its signing key.
 */
export interface ColumnInfo {
  name: string;
  nullable: boolean;
}

export interface PrepareContext {
  table: string;
  columns: ReadonlyMap<string, ColumnInfo>;
  /** single-column foreign keys of this table: column → referenced table */
  foreignKeys: ReadonlyMap<string, string>;
  /** columns that reference this same table */
  selfReferences: ReadonlySet<string>;
  /** primary keys already imported, for the tables something points at */
  known: ReadonlyMap<string, ReadonlySet<string>>;
  masterKey: Buffer;
  policy: TablePolicy;
}

export interface Deferred {
  id: string;
  column: string;
  value: string;
}

export type Prepared =
  | {
      kind: "row";
      row: Record<string, unknown>;
      deferred: Deferred[];
      nulled: string[];
      ignored: string[];
    }
  | { kind: "skipped"; column: string };

/** Postgres `bytea` as the archive writes it (`to_jsonb`): a `\x…` hex string. */
function bytea(value: Buffer): string {
  return `\\x${value.toString("hex")}`;
}

export function prepareRow(source: Record<string, unknown>, context: PrepareContext): Prepared {
  const row: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [column, value] of Object.entries(source)) {
    if (context.columns.has(column)) row[column] = value;
    else ignored.push(column);
  }

  const nulled: string[] = [];
  for (const [column, referenced] of context.foreignKeys) {
    if (context.selfReferences.has(column)) continue;
    const value = row[column];
    if (typeof value !== "string") continue;
    const known = context.known.get(referenced);
    if (known === undefined || known.has(value)) continue;
    if (context.columns.get(column)?.nullable === true) {
      row[column] = null;
      nulled.push(column);
    } else {
      return { kind: "skipped", column };
    }
  }

  const deferred: Deferred[] = [];
  const id = row.id;
  for (const column of context.selfReferences) {
    const value = row[column];
    if (typeof value === "string" && typeof id === "string") {
      deferred.push({ id, column, value });
      row[column] = null;
    }
  }

  const plain = new Set(context.policy.writtenPlain);
  for (const column of context.policy.encrypted ?? []) {
    const value = row[column];
    if (typeof value === "string" && value !== "" && !plain.has(column)) {
      row[column] = encryptText(value, context.masterKey);
    }
  }

  if (context.table === "accounts") {
    if (context.columns.has("wrapped_data_key")) {
      row.wrapped_data_key = bytea(wrapDataKey(generateDataKey(), context.masterKey));
    }
    if (context.columns.has("is_foundry")) row.is_foundry = false;
    if (context.columns.has("can_breed")) row.can_breed = false;
  }
  if (context.table === "gosini") {
    if (context.columns.has("wrapped_soul_key")) {
      row.wrapped_soul_key = bytea(wrapDataKey(generateDataKey(), context.masterKey));
    }
    if (context.columns.has("peer_encounters")) row.peer_encounters = false;
  }

  return { kind: "row", row, deferred, nulled, ignored };
}
