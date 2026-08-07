import { transcriptSegments, type DbClient } from "@ugo/db";
import { cosineDistance, sql } from "drizzle-orm";
import type { EmbeddingsClient } from "./embeddings.js";

export interface RetrievedTranscript {
  id: string;
  meetingId: string;
  /** AES-256-GCM ciphertext — the caller decrypts (key never enters this package) */
  text: string;
  t0: number;
  t1: number;
  similarity: number;
}

/** Ignore segments below this cosine similarity: noise, not an answer. */
const MIN_SIMILARITY = 0.5;

/**
 * Semantic retrieval over recorded speech (PROGETTO §4.2: "cosa aveva detto
 * Ivan su…?" — recordings become interrogable through /chat).
 */
export async function searchTranscripts(
  db: DbClient,
  embedder: EmbeddingsClient,
  query: string,
  k: number,
): Promise<RetrievedTranscript[]> {
  const [queryEmbedding] = await embedder.embed([query]);
  if (queryEmbedding === undefined) throw new Error("query embedding returned nothing");
  const distance = cosineDistance(transcriptSegments.embedding, queryEmbedding);
  const rows = await db
    .select({
      id: transcriptSegments.id,
      meetingId: transcriptSegments.meetingId,
      text: transcriptSegments.text,
      t0: transcriptSegments.t0,
      t1: transcriptSegments.t1,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(transcriptSegments)
    .where(sql`${transcriptSegments.embedding} is not null`)
    .orderBy(distance)
    .limit(k);
  return rows.filter((row) => row.similarity >= MIN_SIMILARITY);
}
