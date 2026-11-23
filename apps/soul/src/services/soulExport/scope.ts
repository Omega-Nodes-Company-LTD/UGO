import { sql, type SQL } from "drizzle-orm";
import type { TablePolicy } from "./policy.js";

/**
 * Which rows of a table belong to this export: the house, narrowed to the
 * creatures the person chose.
 *
 *  - `accounts`            the house row itself;
 *  - `gosini`              the chosen creatures (and only them);
 *  - `births`              the birth certificates of the chosen creatures;
 *  - has `gosino_id`       the chosen creatures' rows — plus, when the table
 *                          also has `account_id`, the house's creature-less
 *                          rows (null `gosino_id`);
 *  - has only `account_id` the whole house: the pack, the rooms, the lists.
 *
 * A table that fits none of these has no way to be told apart from another
 * house's data, so it is refused (`undefined`) rather than exported whole.
 * Every id is a validated uuid passed as a parameter, never interpolated.
 */
export interface ExportScope {
  accountId: string;
  gosinoIds: readonly string[];
}

function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

export function scopeFor(
  table: string,
  columns: ReadonlySet<string>,
  scope: ExportScope,
  policy: TablePolicy = {},
): SQL | undefined {
  const ids = uuidList(scope.gosinoIds);
  if (policy.accountColumns !== undefined && policy.accountColumns.length > 0) {
    const ties = policy.accountColumns.map((column) => sql`t.${sql.identifier(column)} = ${scope.accountId}::uuid`);
    return sql`(${sql.join(ties, sql` or `)})`;
  }
  if (table === "accounts") return sql`t.id = ${scope.accountId}::uuid`;
  if (table === "gosini") return sql`t.account_id = ${scope.accountId}::uuid and t.id in (${ids})`;
  if (table === "births") {
    return sql`t.account_id = ${scope.accountId}::uuid and t.child_gosino_id in (${ids})`;
  }
  const hasHouse = columns.has("account_id");
  if (columns.has("gosino_id")) {
    return hasHouse
      ? sql`t.account_id = ${scope.accountId}::uuid and (t.gosino_id is null or t.gosino_id in (${ids}))`
      : sql`t.gosino_id in (${ids})`;
  }
  return hasHouse ? sql`t.account_id = ${scope.accountId}::uuid` : undefined;
}
