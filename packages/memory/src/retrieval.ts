import { memories, type DbClient } from "@ugo/db";
import type { MemoryKind } from "@ugo/shared";
import { inArray } from "drizzle-orm";
import { fetchCandidates } from "./candidates.js";
import type { EmbeddingsClient } from "./embeddings.js";
import { rerank, type RankedMemory } from "./rerank.js";

/** Fetch 4× the requested k before re-ranking, so re-rank has room to act. */
const CANDIDATE_MULTIPLIER = 4;

export interface WriteMemoryInput {
  kind: MemoryKind;
  text: string;
  importance?: number;
  sourceRefs?: Record<string, unknown>;
}

export async function writeMemory(
  db: DbClient,
  embedder: EmbeddingsClient,
  input: WriteMemoryInput,
): Promise<{ id: string }> {
  const [embedding] = await embedder.embed([input.text]);
  if (embedding === undefined) throw new Error("embedding generation returned nothing");
  const inserted = await db
    .insert(memories)
    .values({
      kind: input.kind,
      text: input.text,
      embedding,
      importance: input.importance ?? 0.5,
      sourceRefs: input.sourceRefs ?? {},
    })
    .returning({ id: memories.id });
  const row = inserted[0];
  if (row === undefined) throw new Error("memory insert returned no row");
  return row;
}

/**
 * Below this cosine similarity a memory is noise, not an answer — unless the
 * lexical arm found it, see below. Same value as `searchTranscripts`, and the
 * same reasoning, because the bench showed the alternative does not work:
 * across this corpus the best similarity for an unanswerable question reaches
 * 0.672 while an answerable one starts at 0.624, so the two ranges **overlap**
 * and no absolute cut separates them. A threshold cannot deliver abstention
 * here, so it should not try: its only job is dropping obvious noise, and a
 * conservative value does that without discarding true answers. At 0.6 it was
 * already cutting the right episodic answer.
 */
export const MIN_SIMILARITY = 0.5;

/**
 * Top-k hybrid retrieval (PROGETTO §5.4, ADR-022): vector and lexical arms,
 * fused by rank, re-ranked by relevance × importance × recency, then
 * `last_accessed` touched on the winners so used memories stay alive.
 *
 * The threshold is disjunctive: a row survives if it is semantically close
 * **or** if the lexical arm matched it. That asymmetry is the feature, not a
 * loophole — a number plate has a poor cosine and an exact token, and dropping
 * it for being "far" would throw away the one case hybrid search exists for.
 */
export async function searchMemories(
  db: DbClient,
  embedder: EmbeddingsClient,
  query: string,
  k: number,
  now: Date = new Date(),
): Promise<RankedMemory[]> {
  const [queryEmbedding] = await embedder.embed([query]);
  if (queryEmbedding === undefined) throw new Error("query embedding returned nothing");

  const candidates = await fetchCandidates(db, queryEmbedding, query, k * CANDIDATE_MULTIPLIER);
  const worthAnswering = candidates.filter(
    (candidate) => candidate.similarity >= MIN_SIMILARITY || candidate.lexicalRank !== undefined,
  );

  const ranked = rerank(worthAnswering, now).slice(0, k);
  if (ranked.length > 0) {
    await db
      .update(memories)
      .set({ lastAccessed: now })
      .where(
        inArray(
          memories.id,
          ranked.map((memory) => memory.id),
        ),
      );
  }
  return ranked;
}
