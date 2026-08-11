import { memories, type DbClient } from "@ugo/db";
import { cosineDistance, sql } from "drizzle-orm";
import type { RerankCandidate } from "./rerank.js";

/**
 * The candidate set for hybrid retrieval (ADR-022): one arm ranks by vector
 * distance, the other by lexical match, and a row is a candidate if either arm
 * found it.
 *
 * Both arms filter on `invalidated_at is null`. That repetition is the point:
 * putting the filter only on the vector arm is how a retired fact comes back
 * through the side door, and migration 0006 promised it would not.
 */

interface CandidateRow extends Record<string, unknown> {
  id: string;
  text: string;
  kind: string;
  // Raw driver rows: `db.execute` does not go through drizzle's column mapping,
  // so every value arrives as whatever postgres-js decided. Timestamps are not
  // Date objects, and `row_number()` is a bigint, which the driver hands back
  // as a string — left unconverted it would turn `60 + rank` into "601" and
  // quietly produce a nonsense fusion score.
  importance: string | number;
  last_accessed: string | Date | null;
  created_at: string | Date;
  similarity: string | number;
  vector_rank: string | number | null;
  lexical_rank: string | number | null;
}

export async function fetchCandidates(
  db: DbClient,
  queryEmbedding: readonly number[],
  queryText: string,
  limit: number,
): Promise<RerankCandidate[]> {
  const distance = cosineDistance(memories.embedding, [...queryEmbedding]);

  // `websearch_to_tsquery` and not `to_tsquery`: it never throws on whatever a
  // person typed. On a query made only of stopwords it yields an empty tsquery,
  // which matches nothing — the lexical arm simply stays silent, which is the
  // correct behaviour and not an error to handle.
  const rows = await db.execute<CandidateRow>(sql`
    with tsq as (
      select websearch_to_tsquery('italian', ${queryText})
          || websearch_to_tsquery('simple', ${queryText}) as query
    ),
    vector_arm as (
      select id, row_number() over (order by ${distance}) as rank
      from ${memories}
      where embedding is not null and invalidated_at is null
      order by ${distance}
      limit ${limit}
    ),
    lexical_arm as (
      select m.id, row_number() over (order by ts_rank_cd(m.search_vector, tsq.query) desc) as rank
      from ${memories} m, tsq
      where m.invalidated_at is null and m.search_vector @@ tsq.query
      limit ${limit}
    )
    select ${memories.id}, ${memories.text}, ${memories.kind}, ${memories.importance},
           ${memories.lastAccessed}, ${memories.createdAt},
           1 - (${distance}) as similarity,
           v.rank as vector_rank, l.rank as lexical_rank
    from ${memories}
    left join vector_arm v on v.id = ${memories.id}
    left join lexical_arm l on l.id = ${memories.id}
    where v.id is not null or l.id is not null
  `);

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    kind: row.kind,
    importance: Number(row.importance),
    lastAccessed: row.last_accessed === null ? null : new Date(row.last_accessed),
    createdAt: new Date(row.created_at),
    similarity: Number(row.similarity),
    vectorRank: row.vector_rank === null ? undefined : Number(row.vector_rank),
    lexicalRank: row.lexical_rank === null ? undefined : Number(row.lexical_rank),
  }));
}
