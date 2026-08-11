/**
 * Reciprocal Rank Fusion of the two retrieval arms (ADR-022).
 *
 * Why ranks and not scores: cosine similarity lives in roughly [0,1] while
 * `ts_rank_cd` is unbounded and has no scale of its own. Turning them into one
 * number by weighted sum needs a per-query normalisation, and that
 * normalisation is least stable exactly where it matters — when one arm
 * returns nothing. RRF only ever looks at positions, so an empty arm costs a
 * candidate nothing but the agreement bonus, and there is no weight to tune
 * against a dataset we do not have.
 */

/** From the original RRF paper. Large on purpose: rank 1 and rank 2 stay close. */
export const RRF_K = 60;

/** Both arms first — the most a candidate can score. */
const MAX_SCORE = 2 / (RRF_K + 1);

/**
 * Fuses a candidate's position in the two arms into `[0,1]`.
 * Ranks are 1-based; `undefined` means that arm did not return it at all.
 *
 * The result is normalised so it can take the place of a similarity in the
 * re-rank product without changing the scale that `importance × recency`
 * multiplies into.
 */
export function reciprocalRankFusion(
  vectorRank: number | undefined,
  lexicalRank: number | undefined,
): number {
  const vector = vectorRank === undefined ? 0 : 1 / (RRF_K + vectorRank);
  const lexical = lexicalRank === undefined ? 0 : 1 / (RRF_K + lexicalRank);
  return (vector + lexical) / MAX_SCORE;
}
