import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const journalSchema = z.object({
  entries: z.array(z.object({ idx: z.number().int(), tag: z.string().regex(/^\d{4}_[\w-]+$/u) })).min(1),
});

/**
 * The tag of the newest migration this build knows (`0062_il-gosino-al-telefono`).
 *
 * It is what a `.ugosoul` archive records as `schemaVersion` (ADR-132): "the
 * data in here was written by a database at this point of the schema". Read
 * from drizzle's own journal — the same folder `runMigrations` applies — so
 * there is no second list to keep in step.
 */
export function latestMigrationTag(): string {
  const folder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
  const journal = journalSchema.parse(
    JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")),
  );
  const newest = journal.entries.reduce((a, b) => (b.idx > a.idx ? b : a));
  return newest.tag;
}
