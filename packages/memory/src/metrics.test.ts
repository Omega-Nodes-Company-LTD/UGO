import { describe, expect, it } from "vitest";
import { benchReport, recallAtK, reciprocalRank, type BenchCase } from "./metrics.js";

// Pure scoring over an already-executed retrieval: no DB, no embeddings.
// The playbook allows unit tests exactly here (same standing as rerank.ts).

function benchCase(overrides: Partial<BenchCase>): BenchCase {
  return { query: "?", relevant: ["a"], retrieved: ["a"], ...overrides };
}

describe("recallAtK", () => {
  it("is the share of the relevant memories that surfaced in the top k", () => {
    expect(recallAtK(["a", "x", "b"], ["a", "b"], 3)).toBe(1);
    expect(recallAtK(["a", "x", "b"], ["a", "b"], 2)).toBe(0.5);
  });

  it("is zero when nothing relevant came back", () => {
    expect(recallAtK(["x", "y"], ["a"], 2)).toBe(0);
  });

  it("ignores anything past k, so a lucky tail does not count", () => {
    expect(recallAtK(["x", "x", "a"], ["a"], 2)).toBe(0);
  });

  it("does not reward duplicates of the same relevant memory", () => {
    expect(recallAtK(["a", "a"], ["a", "b"], 2)).toBe(0.5);
  });

  it("has nothing to measure when the question has no answer", () => {
    // an unanswerable question belongs to abstention, not to recall
    expect(() => recallAtK(["x"], [], 1)).toThrow();
  });
});

describe("reciprocalRank", () => {
  it("rewards the position of the first relevant memory", () => {
    expect(reciprocalRank(["a", "b"], ["a"])).toBe(1);
    expect(reciprocalRank(["x", "a"], ["a"])).toBe(0.5);
    expect(reciprocalRank(["x", "y", "a"], ["a"])).toBeCloseTo(1 / 3, 10);
  });

  it("is zero when the relevant memory never appears", () => {
    expect(reciprocalRank(["x", "y"], ["a"])).toBe(0);
  });
});

describe("benchReport", () => {
  it("splits answerable from unanswerable and scores each on its own terms", () => {
    const report = benchReport(
      [
        benchCase({ relevant: ["a"], retrieved: ["a", "x"] }),
        benchCase({ relevant: ["b"], retrieved: ["x", "b"] }),
        // unanswerable: retrieval correctly held its tongue
        benchCase({ relevant: [], retrieved: [] }),
        // unanswerable: retrieval answered anyway
        benchCase({ relevant: [], retrieved: ["x"] }),
      ],
      2,
    );

    expect(report.answerable).toBe(2);
    expect(report.unanswerable).toBe(2);
    expect(report.recallAtK).toBe(1);
    expect(report.mrr).toBeCloseTo((1 + 0.5) / 2, 10);
    expect(report.abstentionRate).toBe(0.5);
  });

  it("reports a perfect abstention rate when every unanswerable question is refused", () => {
    const report = benchReport([benchCase({ relevant: [], retrieved: [] })], 3);
    expect(report.abstentionRate).toBe(1);
    expect(report.answerable).toBe(0);
  });

  it("leaves a rate at zero rather than dividing by nothing", () => {
    // no unanswerable case at all: abstention is not a number we earned
    const report = benchReport([benchCase({})], 1);
    expect(report.unanswerable).toBe(0);
    expect(report.abstentionRate).toBe(0);
    expect(report.recallAtK).toBe(1);
  });

  it("has no opinion on an empty suite", () => {
    const report = benchReport([], 3);
    expect(report).toEqual({
      answerable: 0,
      unanswerable: 0,
      recallAtK: 0,
      mrr: 0,
      abstentionRate: 0,
    });
  });
});
