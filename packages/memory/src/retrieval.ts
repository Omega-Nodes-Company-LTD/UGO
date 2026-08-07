import { memories, type DbClient } from "@ugo/db";
import type { MemoryKind } from "@ugo/shared";
import { cosineDistance, inArray, sql } from "drizzle-orm";
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
 * Top-k semantic retrieval (PROGETTO §5.4): pgvector cosine top-N candidates,
 * pure re-rank similarity × importance × recency, then touch last_accessed of
 * the winners so used memories stay alive.
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

  const distance = cosineDistance(memories.embedding, queryEmbedding);
  const candidates = await db
    .select({
      id: memories.id,
      text: memories.text,
      kind: memories.kind,
      importance: memories.importance,
      lastAccessed: memories.lastAccessed,
      createdAt: memories.createdAt,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(memories)
    .where(sql`${memories.embedding} is not null`)
    .orderBy(distance)
    .limit(k * CANDIDATE_MULTIPLIER);

  const ranked = rerank(candidates, now).slice(0, k);
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
