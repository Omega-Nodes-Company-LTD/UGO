import { describe, expect, it } from "vitest";
import { eagerness, whoAnswers, type Candidate } from "./whoAnswers.js";

/**
 * Who speaks up (ADR-040). Pure, so a unit test is the honest instrument
 * (TESTING_PLAYBOOK §1) — and what is worth asserting is the property the bug
 * violated: **everyone eventually speaks**. The eldest answering every single
 * sentence is what the owner actually saw, and a test that only checks "one
 * came back" would have passed happily through it.
 */

const pig = (id: string, talkativeness: number, boldness = 0.5) => ({
  id,
  traits: { talkativeness, boldness },
});

/** Rolls the whole range, so this asks about the distribution and not one draw. */
const overTheRange = (candidates: Candidate[], steps = 200): string[] => {
  const seen: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    const chosen = whoAnswers(candidates, i / steps)[0];
    if (chosen !== undefined) seen.push(chosen.id);
  }
  return seen;
};

describe("who answers", () => {
  it("always the same one was the bug: everybody gets a turn", () => {
    const spoke = new Set(overTheRange([pig("ugo", 0.5), pig("nino", 0.5)]));

    expect([...spoke].sort()).toEqual(["nino", "ugo"]);
  });

  it("lets the shy one speak too — rarely is not never", () => {
    // a weight of zero would recreate the bug for that creature
    const counts = overTheRange([pig("chiacchierone", 1), pig("timido", 0)]);

    expect(counts).toContain("timido");
    expect(counts.filter((id) => id === "chiacchierone").length).toBeGreaterThan(
      counts.filter((id) => id === "timido").length,
    );
  });

  it("makes the genome audible: the talkative one answers more often", () => {
    const counts = overTheRange([pig("a", 0.9), pig("b", 0.2)]);
    const a = counts.filter((id) => id === "a").length;

    expect(a).toBeGreaterThan(counts.length / 2);
  });

  it("treats a creature with no genome as middling, not as mute", () => {
    const spoke = new Set(overTheRange([{ id: "senza" }, pig("con", 0.5)]));

    expect(spoke.has("senza")).toBe(true);
  });

  it("is the identity in a room of one, whatever the roll", () => {
    for (const roll of [0, 0.5, 1]) {
      expect(whoAnswers([pig("solo", 0.1)], roll).map((c) => c.id)).toEqual(["solo"]);
    }
  });

  it("answers nobody for an empty room, instead of inventing somebody", () => {
    expect(whoAnswers([], 0.5)).toEqual([]);
  });

  it("survives a roll at the very edge of the range", () => {
    // a roll of exactly 1 walks off the end of the weights; it must still pick
    expect(whoAnswers([pig("a", 0.5), pig("b", 0.5)], 1)).toHaveLength(1);
    expect(whoAnswers([pig("a", 0.5), pig("b", 0.5)], 0)).toHaveLength(1);
  });
});

describe("eagerness", () => {
  it("never reaches zero, so no creature is structurally silent", () => {
    expect(eagerness({ id: "muto", traits: { talkativeness: 0, boldness: 0 } })).toBeGreaterThan(0);
  });

  it("rises with both talkativeness and boldness", () => {
    const quiet = eagerness({ id: "q", traits: { talkativeness: 0.1, boldness: 0.1 } });
    const loud = eagerness({ id: "l", traits: { talkativeness: 0.9, boldness: 0.9 } });

    expect(loud).toBeGreaterThan(quiet);
    // talkativeness weighs more: it is the trait that is about speaking
    const chatty = eagerness({ id: "c", traits: { talkativeness: 0.9, boldness: 0.1 } });
    const bold = eagerness({ id: "b", traits: { talkativeness: 0.1, boldness: 0.9 } });
    expect(chatty).toBeGreaterThan(bold);
  });
});
