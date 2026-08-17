import { transcriptSegments, type DbClient } from "@ugo/db";
import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
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
 *
 * `householdId` is required, and deliberately not optional the way
 * `searchMemories`'s `gosinoId` is. There the omitted scope means "every
 * exemplar under this roof", which a single-exemplar house can legitimately
 * ask for; here the omitted scope meant *every house on the server*, and the
 * caller decrypted whatever came back with its own key. A recording is the
 * most private thing this system holds, and the boundary it crossed was the
 * one boundary ADR-019 exists to draw.
 */
export async function searchTranscripts(
  db: DbClient,
  embedder: EmbeddingsClient,
  query: string,
  k: number,
  householdId: string,
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
    // ADR-048 put `household_id` on the row itself precisely so this filter
    // would be one column and not a two-level subquery through `meetings`
    .where(
      and(
        isNotNull(transcriptSegments.embedding),
        eq(transcriptSegments.householdId, householdId),
      ),
    )
    .orderBy(distance)
    .limit(k);
  return rows.filter((row) => row.similarity >= MIN_SIMILARITY);
}
