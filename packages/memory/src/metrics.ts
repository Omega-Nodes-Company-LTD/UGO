/**
 * How well does UGO remember? (backlog, gruppo 1 — "banco di prova della memoria")
 *
 * Retrieval quality was never measurable: a change to the ranking could only be
 * argued, not demonstrated. These are the three numbers the backlog asks for —
 * temporale and contraddizioni are measured by *which* memory comes back first
 * (recall and MRR), astensione by whether anything comes back at all.
 *
 * Pure on purpose: they score a retrieval that already happened, so the same
 * functions grade the semantic-only baseline and whatever replaces it.
 */

export interface BenchCase {
  query: string;
  /** ids of the memories that answer this question; empty means it has no answer */
  relevant: readonly string[];
  /** ids retrieval returned, best first, already cut at the bench threshold */
  retrieved: readonly string[];
}

export interface BenchReport {
  /** questions that have an answer in the corpus */
  answerable: number;
  /** questions that do not, and where the right move is to say nothing */
  unanswerable: number;
  /** mean recall@k over the answerable ones */
  recallAtK: number;
  /** mean reciprocal rank over the answerable ones */
  mrr: number;
  /** share of the unanswerable ones where retrieval returned nothing */
  abstentionRate: number;
}

/**
 * Share of the relevant memories that made it into the first k results.
 * Throws on an unanswerable question: there is no recall to measure when there
 * was nothing to find, and silently returning 1 (or 0) would quietly skew the
 * suite average in whichever direction the caller happened to guess.
 */
export function recallAtK(
  retrieved: readonly string[],
  relevant: readonly string[],
  k: number,
): number {
  if (relevant.length === 0) {
    throw new Error("recallAtK needs at least one relevant memory: use abstention instead");
  }
  const top = new Set(retrieved.slice(0, k));
  const found = relevant.filter((id) => top.has(id)).length;
  return found / relevant.length;
}

/** 1/rank of the first relevant memory, 0 if none of them came back. */
export function reciprocalRank(
  retrieved: readonly string[],
  relevant: readonly string[],
): number {
  const wanted = new Set(relevant);
  const rank = retrieved.findIndex((id) => wanted.has(id));
  return rank === -1 ? 0 : 1 / (rank + 1);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Grades a whole suite, keeping answerable and unanswerable questions apart:
 * a system that answers everything scores well on recall and terribly on
 * abstention, and that trade-off is the point of measuring both.
 */
export function benchReport(cases: readonly BenchCase[], k: number): BenchReport {
  const answerable = cases.filter((one) => one.relevant.length > 0);
  const unanswerable = cases.filter((one) => one.relevant.length === 0);

  return {
    answerable: answerable.length,
    unanswerable: unanswerable.length,
    recallAtK: mean(answerable.map((one) => recallAtK(one.retrieved, one.relevant, k))),
    mrr: mean(answerable.map((one) => reciprocalRank(one.retrieved, one.relevant))),
    abstentionRate: mean(unanswerable.map((one) => (one.retrieved.length === 0 ? 1 : 0))),
  };
}
