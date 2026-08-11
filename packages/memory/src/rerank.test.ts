import { describe, expect, it } from "vitest";
import { recencyFactor, rerank, RECENCY_TAU_DAYS, type RerankCandidate } from "./rerank.js";

// Pure re-rank: the one part of @ugo/memory the playbook allows as unit tests.

const NOW = new Date("2026-08-07T12:00:00Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

function candidate(overrides: Partial<RerankCandidate>): RerankCandidate {
  return {
    id: crypto.randomUUID(),
    text: "x",
    kind: "fact",
    similarity: 0.8,
    importance: 0.5,
    lastAccessed: null,
    createdAt: daysAgo(1),
    ...overrides,
  };
}

describe("rerank = similarità × importanza × recency", () => {
  it("orders by the product, not by similarity alone", () => {
    const similarButStale = candidate({
      id: "stale",
      similarity: 0.9,
      importance: 0.2,
      createdAt: daysAgo(90),
    });
    const slightlyLessSimilarButAlive = candidate({
      id: "alive",
      similarity: 0.8,
      importance: 0.9,
      lastAccessed: daysAgo(0),
    });
    const ranked = rerank([similarButStale, slightlyLessSimilarButAlive], NOW);
    expect(ranked[0]?.id).toBe("alive");
  });

  it("computes the score as the literal product", () => {
    const c = candidate({ similarity: 0.5, importance: 0.5, lastAccessed: daysAgo(0) });
    const [ranked] = rerank([c], NOW);
    expect(ranked?.score).toBeCloseTo(0.5 * 0.5 * 1, 5);
  });

  it("recency uses last access when present, creation otherwise", () => {
    const neverRead = candidate({ kind: "episode", createdAt: daysAgo(30) });
    const readToday = candidate({ kind: "episode", createdAt: daysAgo(30), lastAccessed: daysAgo(0) });
    expect(recencyFactor(neverRead, NOW)).toBeCloseTo(Math.exp(-1), 5);
    expect(recencyFactor(readToday, NOW)).toBe(1);
  });

  it("used memories stay alive: touching last_accessed lifts the score", () => {
    const before = candidate({ createdAt: daysAgo(60) });
    const after = { ...before, lastAccessed: daysAgo(0) };
    const [b] = rerank([before], NOW);
    const [a] = rerank([after], NOW);
    expect((a?.score ?? 0) > (b?.score ?? 0)).toBe(true);
  });
});

// ADR-022: with two arms the product takes the fused rank instead of the raw
// similarity, which is what lets a lexical-only hit compete at all.
describe("relevance = fused rank when the search had two arms (ADR-022)", () => {
  it("falls back to plain similarity when neither arm reported a rank", () => {
    // the single-arm path, unchanged: every existing caller lands here
    const [ranked] = rerank([candidate({ similarity: 0.7, importance: 0.5 })], NOW);
    expect(ranked?.relevance).toBe(0.7);
  });

  it("keeps similarity as a diagnostic even when relevance replaces it", () => {
    const [ranked] = rerank([candidate({ similarity: 0.31, vectorRank: 4, lexicalRank: 1 })], NOW);
    expect(ranked?.similarity).toBe(0.31);
    expect(ranked?.relevance).not.toBe(0.31);
  });

  it("lets a poor cosine with an exact word match beat a mediocre semantic hit", () => {
    // the measured case: a number plate has a bad cosine and an exact token
    const code = candidate({
      id: "targa",
      similarity: 0.32,
      importance: 0.7,
      lexicalRank: 1,
      vectorRank: undefined,
    });
    const vague = candidate({
      id: "vago",
      similarity: 0.61,
      importance: 0.7,
      vectorRank: 1,
      lexicalRank: undefined,
    });
    const ranked = rerank([vague, code], NOW);
    // agreement decides nothing here — both were first in exactly one arm —
    // so they tie on relevance and importance, and recency breaks it
    expect(ranked.map((one) => one.id).sort()).toEqual(["targa", "vago"]);
    expect(ranked[0]?.relevance).toBe(ranked[1]?.relevance);
  });

  it("puts what both arms agree on above what only one of them found", () => {
    const agreed = candidate({ id: "both", similarity: 0.4, vectorRank: 1, lexicalRank: 1 });
    const oneArm = candidate({ id: "one", similarity: 0.9, vectorRank: 1 });
    const ranked = rerank([oneArm, agreed], NOW);
    expect(ranked[0]?.id).toBe("both");
  });
});

// ADR-021: the exponential decay used to do two jobs at once — "questo ricordo
// non serve più" and "questo ricordo non è più vero". Migration 0006 gave the
// second one its own mechanism, so τ can go back to meaning only the first,
// which is a different length of time for an episode than for a fact.
describe("il tempo non passa allo stesso modo per tutti i ricordi (ADR-021)", () => {
  it("decays an episode fast and a fact slowly", () => {
    const age = 120;
    const episode = recencyFactor(candidate({ kind: "episode", createdAt: daysAgo(age) }), NOW);
    const fact = recencyFactor(candidate({ kind: "fact", createdAt: daysAgo(age) }), NOW);
    expect(episode).toBeCloseTo(Math.exp(-age / 30), 5);
    expect(fact).toBeCloseTo(Math.exp(-age / 730), 5);
    expect(fact).toBeGreaterThan(episode);
  });

  it("orders the four kinds from the most perishable to the most stable", () => {
    expect(RECENCY_TAU_DAYS.episode).toBeLessThan(RECENCY_TAU_DAYS.insight);
    expect(RECENCY_TAU_DAYS.insight).toBeLessThan(RECENCY_TAU_DAYS.preference);
    expect(RECENCY_TAU_DAYS.preference).toBeLessThan(RECENCY_TAU_DAYS.fact);
  });

  it("falls back to the shortest τ for a kind it has never heard of", () => {
    // a new kind should fade too fast rather than live forever
    const unknown = recencyFactor(candidate({ kind: "rumour", createdAt: daysAgo(60) }), NOW);
    expect(unknown).toBeCloseTo(Math.exp(-60 / RECENCY_TAU_DAYS.episode), 5);
  });

  it("stops the decay from vetoing similarity and importance on a stable fact", () => {
    // the measured case: the right memory is the most similar of the corpus and
    // used to lose to a recent irrelevant one purely on age
    const oldButRight = candidate({
      id: "gatto",
      kind: "fact",
      similarity: 0.676,
      importance: 0.8,
      createdAt: daysAgo(120),
    });
    const freshButWrong = candidate({
      id: "riunione",
      kind: "fact",
      similarity: 0.608,
      importance: 0.75,
      createdAt: daysAgo(5),
    });
    const ranked = rerank([freshButWrong, oldButRight], NOW);
    expect(ranked[0]?.id).toBe("gatto");
  });

  it("still lets a fresh episode beat a stale one, which is what decay is for", () => {
    const stale = candidate({ id: "stale", kind: "episode", createdAt: daysAgo(90) });
    const fresh = candidate({ id: "fresh", kind: "episode", createdAt: daysAgo(1) });
    const ranked = rerank([stale, fresh], NOW);
    expect(ranked[0]?.id).toBe("fresh");
  });
});
