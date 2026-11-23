import { TABLES } from "../soulExport/policyTables.js";
import type { ImportState } from "./types.js";

const EMBED_CHUNK = 64;

export interface Pending {
  /** the archive row as it came: its text is still plaintext, which is what gets embedded */
  raw: Record<string, unknown>;
  /** the row that will be inserted: gains its vector here */
  row: Record<string, unknown>;
}

/**
 * Recomputes the vectors an archive never carries (ADR-132): they belong to a
 * model, and a model can change. Texts are embedded from the PLAINTEXT of the
 * archive row, before the text is re-encrypted for storage.
 *
 * With no embedder (or `skipEmbeddings`) the rows go in without a vector and are
 * counted as pending — the creature still has its memories, just not its
 * semantic search until they are rebuilt. The embedder is built on the import's
 * own transaction, so its spend lands in the new house's ledger.
 */
export async function embedBatch(state: ImportState, table: string, batch: Pending[]): Promise<void> {
  const spec = TABLES[table]?.embed;
  if (spec === undefined) return;
  const gosinoId = state.report.gosinoIds[0];
  if (
    state.deps.embedderFor === undefined ||
    state.options.skipEmbeddings === true ||
    state.accountId === undefined ||
    gosinoId === undefined
  ) {
    state.report.embeddings.pending += batch.length;
    return;
  }
  state.embedder ??= state.deps.embedderFor(state.tx, state.accountId, gosinoId);
  const withText = batch.filter(
    (item) => typeof item.raw[spec.from] === "string" && item.raw[spec.from] !== "",
  );
  for (let at = 0; at < withText.length; at += EMBED_CHUNK) {
    const chunk = withText.slice(at, at + EMBED_CHUNK);
    const vectors = await state.embedder.embed(chunk.map((item) => String(item.raw[spec.from])));
    chunk.forEach((item, index) => {
      item.row[spec.vector] = vectors[index];
    });
    state.report.embeddings.computed += chunk.length;
  }
  state.report.embeddings.pending += batch.length - withText.length;
}
