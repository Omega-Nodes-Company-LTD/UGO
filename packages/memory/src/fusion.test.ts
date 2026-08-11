import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, RRF_K } from "./fusion.js";

// Pure fusion of two rankings: no DB, no embeddings.

describe("reciprocalRankFusion", () => {
  it("gives its maximum to something first in both rankings", () => {
    expect(reciprocalRankFusion(1, 1)).toBe(1);
  });

  it("rewards agreement: first in both beats first in one", () => {
    expect(reciprocalRankFusion(1, 1)).toBeGreaterThan(reciprocalRankFusion(1, undefined));
    expect(reciprocalRankFusion(1, 1)).toBeGreaterThan(reciprocalRankFusion(undefined, 1));
  });

  it("treats the two arms alike: neither is worth more than the other", () => {
    expect(reciprocalRankFusion(3, undefined)).toBe(reciprocalRankFusion(undefined, 3));
    expect(reciprocalRankFusion(2, 7)).toBe(reciprocalRankFusion(7, 2));
  });

  it("decreases as either rank gets worse, and never goes negative", () => {
    expect(reciprocalRankFusion(1, 5)).toBeGreaterThan(reciprocalRankFusion(2, 5));
    expect(reciprocalRankFusion(5, 1)).toBeGreaterThan(reciprocalRankFusion(5, 2));
    expect(reciprocalRankFusion(1000, 1000)).toBeGreaterThan(0);
  });

  it("lets a lexical-only match outrank a mediocre semantic one", () => {
    // the whole point: a code has a poor cosine and an exact word match
    const lexicalOnly = reciprocalRankFusion(undefined, 1);
    const semanticMiddling = reciprocalRankFusion(8, undefined);
    expect(lexicalOnly).toBeGreaterThan(semanticMiddling);
  });

  it("is zero when neither arm found it, because then it is not a candidate", () => {
    expect(reciprocalRankFusion(undefined, undefined)).toBe(0);
  });

  it("stays inside [0,1] so it can stand in for a similarity", () => {
    for (const [v, l] of [
      [1, 1],
      [1, undefined],
      [undefined, 1],
      [50, 50],
      [undefined, undefined],
    ] as const) {
      const score = reciprocalRankFusion(v, l);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("uses the conventional damping constant", () => {
    // k=60 is the value from the original RRF paper; it is deliberately large
    // so the difference between rank 1 and rank 2 stays modest
    expect(RRF_K).toBe(60);
    const oneVsTwo = reciprocalRankFusion(1, undefined) / reciprocalRankFusion(2, undefined);
    expect(oneVsTwo).toBeLessThan(1.05);
  });
});
