import { describe, expect, it } from "vitest";
import { recencyFactor, rerank, type RerankCandidate } from "./rerank.js";

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
    const neverRead = candidate({ createdAt: daysAgo(30) });
    const readToday = candidate({ createdAt: daysAgo(30), lastAccessed: daysAgo(0) });
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
