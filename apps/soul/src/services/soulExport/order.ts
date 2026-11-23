/**
 * The order tables go into an archive (ADR-132, MKT-10.5): what is referenced
 * comes before what references it.
 *
 * That is what lets the importer **stream**. It reads the archive once, in
 * file order, and inserts as it goes; if the file listed `messages` before
 * `gosini`, the importer would have to hold a table in memory — plaintext —
 * until its parents arrived. Putting the order in the writer keeps the reader
 * dumb and the memory flat.
 *
 * Self-references are ignored here (a table pointing at itself has no "before");
 * the importer handles those columns row by row. A real cycle between two
 * tables would be a schema the importer cannot load in one pass, so it stops
 * here, at export time, rather than at a customer's machine.
 *
 * `edges` are `[table, referencedTable]`. Ties come out alphabetically so two
 * exports of the same data list tables identically.
 */
export function orderByForeignKeys(
  tables: readonly string[],
  edges: readonly (readonly [string, string])[],
): string[] {
  const present = new Set(tables);
  const needs = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const [table, referenced] of edges) {
    if (table === referenced || !present.has(table) || !present.has(referenced)) continue;
    needs.get(table)?.add(referenced);
  }

  const ordered: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((table) => [...(needs.get(table) ?? [])].every((dep) => !remaining.has(dep)))
      .sort((a, b) => a.localeCompare(b));
    const next = ready[0];
    if (next === undefined) {
      throw new Error(`cycle among tables: ${[...remaining].sort().join(", ")}`);
    }
    ordered.push(next);
    remaining.delete(next);
  }
  return ordered;
}
