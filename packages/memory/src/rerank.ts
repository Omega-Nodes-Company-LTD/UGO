/**
 * Pure re-rank of retrieval candidates (PROGETTO §5.4):
 *   score = similarità × importanza × recency
 * recency decays exponentially with τ = 30 days over the last access
 * (or creation, if never accessed): used memories stay alive.
 */

export const RECENCY_TAU_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface RerankCandidate {
  id: string;
  text: string;
  kind: string;
  similarity: number;
  importance: number;
  lastAccessed: Date | null;
  createdAt: Date;
}

export interface RankedMemory extends RerankCandidate {
  recency: number;
  score: number;
}

export function recencyFactor(candidate: RerankCandidate, now: Date): number {
  const reference = candidate.lastAccessed ?? candidate.createdAt;
  const ageDays = Math.max(0, now.getTime() - reference.getTime()) / MS_PER_DAY;
  return Math.exp(-ageDays / RECENCY_TAU_DAYS);
}

export function rerank(candidates: readonly RerankCandidate[], now: Date): RankedMemory[] {
  return candidates
    .map((candidate) => {
      const recency = recencyFactor(candidate, now);
      return { ...candidate, recency, score: candidate.similarity * candidate.importance * recency };
    })
    .sort((a, b) => b.score - a.score);
}
