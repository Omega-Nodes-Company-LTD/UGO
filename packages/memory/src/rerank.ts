/**
 * Pure re-rank of retrieval candidates (PROGETTO §5.4):
 *   score = similarità × importanza × recency
 * recency decays exponentially over the last access (or creation, if never
 * accessed): used memories stay alive.
 *
 * τ is per kind, not global (ADR-021). The decay used to do two jobs at once —
 * "questo ricordo non serve più" and "questo ricordo non è più vero" — because
 * a fact had no other way to die. Migration 0006 gave obsolescence its own
 * mechanism (`invalidated_at`, `superseded_by`), so the decay can go back to
 * meaning only the first, and that is a different length of time for something
 * that happened on a Tuesday than for the name of the cat.
 *
 * The measured cost of getting this wrong, from the memory bench: at a global
 * τ=30d a 120-day-old memory is penalised 46×, while similarity and importance
 * are both bounded by 1 — so the two terms that carry the information could not
 * outvote age for anything older than a season.
 */
import { reciprocalRankFusion } from "./fusion.js";

export const RECENCY_TAU_DAYS = {
  /** something that happened on a day: its bearing on today really does fade */
  episode: 30,
  /** an understanding of how things are — stable, but revisable in silence */
  insight: 180,
  /** tastes change, and slowly */
  preference: 365,
  /** a state of the world: it does not fade, it gets invalidated */
  fact: 730,
} as const;

/** An unknown kind should fade too fast rather than live forever. */
const FALLBACK_TAU_DAYS = Math.min(...Object.values(RECENCY_TAU_DAYS));

/**
 * `kind` is a plain string on the candidate — the row could carry a kind this
 * build has never heard of — so the lookup is widened deliberately rather than
 * asserted away.
 */
const tauByKind: Record<string, number | undefined> = RECENCY_TAU_DAYS;

const MS_PER_DAY = 86_400_000;

export interface RerankCandidate {
  id: string;
  text: string;
  kind: string;
  similarity: number;
  importance: number;
  lastAccessed: Date | null;
  createdAt: Date;
  /** 1-based position in the vector arm; absent if only the lexical arm found it */
  vectorRank?: number | undefined;
  /** 1-based position in the lexical arm; absent if only the vector arm found it */
  lexicalRank?: number | undefined;
}

export interface RankedMemory extends RerankCandidate {
  recency: number;
  /**
   * What took similarity's place in the product: the fused rank when the search
   * had two arms, the plain similarity when it had one. `similarity` is kept
   * alongside as the diagnostic it always was — `/v1/memories/search` returns
   * it, and a lexical-only hit needs to be able to show a poor cosine.
   */
  relevance: number;
  score: number;
}

export function recencyFactor(candidate: RerankCandidate, now: Date): number {
  const reference = candidate.lastAccessed ?? candidate.createdAt;
  const ageDays = Math.max(0, now.getTime() - reference.getTime()) / MS_PER_DAY;
  const tau = tauByKind[candidate.kind] ?? FALLBACK_TAU_DAYS;
  return Math.exp(-ageDays / tau);
}

/**
 * Quanto pesano importanza e freschezza, e perché sono **modulatori** e non
 * fattori pieni (ADR-110).
 *
 * La formula di §5.4 moltiplica tre numeri, e per anni si è dato per scontato
 * che il primo — quanto il ricordo c'entra con la domanda — comandasse.
 * Misurato sul corpus del banco, ai primi cinque, non è così:
 *
 * | fattore | escursione | da cosa dipende |
 * |---|---|---|
 * | `relevance` | 2,1× | quasi tutta dall'**accordo** dei bracci: fra la prima e la quinta posizione dentro lo stesso braccio c'è il 6% |
 * | `importance` | 3,0× | dall'estrattore che l'ha scritta |
 * | `recency` | 1,9× | dall'età, in unità del τ del suo tipo |
 *
 * `importance × recency` arriva a **3,2×** e scavalca la relevance: la
 * ricerca esprime un'opinione che vale meno di quanto pesi l'anagrafica del
 * ricordo. E siccome l'importanza degli episodi è sistematicamente più bassa
 * di quella dei fatti (0,30–0,45 contro 0,65–0,90), a «cosa si è rotto in
 * casa?» i primi cinque sono tutti fatti — la lavatrice che si è rotta
 * davvero sta sotto al nome del gatto.
 *
 * Non è la recency a schiacciare gli episodi, come si era supposto: è
 * l'importanza, e la recency ci mette il resto.
 *
 * Quindi i due termini restano — un ricordo importante e fresco **deve** poter
 * salire — ma dentro una banda: da `FLOOR` a 1. L'ordinamento a parità di
 * relevance non cambia di una posizione (è una trasformazione monotona), cambia
 * **quanto** possono ribaltare la ricerca.
 */
const IMPORTANCE_FLOOR = 0.5;
const RECENCY_FLOOR = 0.4;

const modulate = (value: number, floor: number): number => floor + (1 - floor) * value;

export function rerank(candidates: readonly RerankCandidate[], now: Date): RankedMemory[] {
  return candidates
    .map((candidate) => {
      const recency = recencyFactor(candidate, now);
      const fused = candidate.vectorRank !== undefined || candidate.lexicalRank !== undefined;
      const relevance = fused
        ? reciprocalRankFusion(candidate.vectorRank, candidate.lexicalRank)
        : candidate.similarity;
      const score =
        relevance *
        modulate(candidate.importance, IMPORTANCE_FLOOR) *
        modulate(recency, RECENCY_FLOOR);
      return { ...candidate, recency, relevance, score };
    })
    .sort((a, b) => b.score - a.score);
}
