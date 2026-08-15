import { customerChunks, type DbClient } from "@ugo/db";
import { and, cosineDistance, eq, sql } from "drizzle-orm";
import type { EmbeddingsClient } from "./embeddings.js";

/**
 * Retrieval over the customer's knowledge index (ADR-054): vector-only over
 * ciphertext — the `searchTranscripts` precedent — and the scope is in the
 * SIGNATURE, not in an option: there is no way to call this without saying
 * whose chunks, of which house. A cross-customer test holds it to that.
 */

export interface RetrievedCustomerChunk {
  id: string;
  sourceType: "repo" | "document" | "email";
  /** path@sha / message-id — identifier, not content */
  ref: string;
  /** AES-256-GCM ciphertext — the caller decrypts (key never enters this package) */
  text: string;
  similarity: number;
}

/** Below this cosine similarity a chunk is noise, not an answer. */
const MIN_SIMILARITY = 0.45;

export async function searchCustomerChunks(
  db: DbClient,
  embedder: EmbeddingsClient,
  query: string,
  k: number,
  customerId: string,
  householdId: string,
): Promise<RetrievedCustomerChunk[]> {
  const [queryEmbedding] = await embedder.embed([query]);
  if (queryEmbedding === undefined) throw new Error("query embedding returned nothing");
  const distance = cosineDistance(customerChunks.embedding, queryEmbedding);
  const rows = await db
    .select({
      id: customerChunks.id,
      sourceType: customerChunks.sourceType,
      ref: customerChunks.ref,
      text: customerChunks.text,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(customerChunks)
    .where(
      and(
        eq(customerChunks.customerId, customerId),
        eq(customerChunks.householdId, householdId),
      ),
    )
    .orderBy(distance)
    .limit(k);
  return rows.filter((row) => row.similarity >= MIN_SIMILARITY);
}
