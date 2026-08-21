import { houseChunks, type DbClient } from "@ugo/db";
import { cosineDistance, eq, sql } from "drizzle-orm";
import type { EmbeddingsClient } from "./embeddings.js";

/**
 * Il recupero sui documenti di casa (ADR-111).
 *
 * Solo vettoriale sopra il ciphertext, come per i clienti e per le
 * trascrizioni: il braccio lessicale non può girare su testo cifrato, e
 * decifrare l'indice per cercarci dentro vorrebbe dire tenerlo in chiaro.
 *
 * La casa sta nella **firma** e non in un'opzione: non esiste un modo di
 * chiamare questa funzione senza dire di chi sono i documenti.
 */

export interface RetrievedHouseChunk {
  id: string;
  /** pagina o finestra — identificatore, non contenuto */
  ref: string;
  /** ciphertext AES-256-GCM: la chiave non entra in questo package */
  text: string;
  similarity: number;
}

/**
 * Sotto questa somiglianza un frammento è rumore, non una risposta.
 *
 * Più alta della soglia dei ricordi, e di proposito: un ricordo che entra a
 * sproposito è una stranezza, un pezzo di contratto che entra a sproposito è
 * UGO che cita un documento che non c'entra — e citare un documento suona
 * autorevole anche quando è sbagliato.
 */
const MIN_SIMILARITY = 0.5;

export async function searchHouseChunks(
  db: DbClient,
  embedder: EmbeddingsClient,
  query: string,
  k: number,
  accountId: string,
): Promise<RetrievedHouseChunk[]> {
  const [queryEmbedding] = await embedder.embed([query]);
  if (queryEmbedding === undefined) throw new Error("query embedding returned nothing");
  const distance = cosineDistance(houseChunks.embedding, queryEmbedding);
  const rows = await db
    .select({
      id: houseChunks.id,
      ref: houseChunks.ref,
      text: houseChunks.text,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(houseChunks)
    .where(eq(houseChunks.accountId, accountId))
    .orderBy(distance)
    .limit(k);
  return rows.filter((row) => row.similarity >= MIN_SIMILARITY);
}
