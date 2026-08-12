import { describe, expect, it } from "vitest";
import { forFrame, SENSED_BY_THE_ROOM, tagFor } from "./faceWs.js";

/**
 * Who a frame reaches (ADR-036).
 *
 * Pure routing, so a unit test is the right instrument (TESTING_PLAYBOOK §1) —
 * and the decision it encodes is a budget rule, not a stylistic one: the senses
 * belong to the room, speech belongs to one. Fanning `heard_text` out would
 * multiply every sentence by the number of creatures present, against
 * CLAUDE.md rule 3.
 */

const senders = [
  { id: "ugo", member: { id: "ugo" }, traits: { talkativeness: 0.5, boldness: 0.5 } },
  { id: "nino", member: { id: "nino" }, traits: { talkativeness: 0.5, boldness: 0.5 } },
];

describe("forFrame", () => {
  it("gives the senses to everyone: the ROOM heard the bang", () => {
    for (const type of SENSED_BY_THE_ROOM) {
      expect(forFrame(JSON.stringify({ type }), senders), type).toHaveLength(2);
    }
  });

  it("gives speech to one, because every sentence would otherwise cost N calls", () => {
    const heard = forFrame(JSON.stringify({ type: "heard_text", text: "ciao" }), senders, 0.1);
    expect(heard).toHaveLength(1);
  });

  /**
   * ADR-040: this is the bug the owner saw. "One answers" was `slice(0, 1)`
   * over a roster ordered by `bornAt`, so the eldest answered every sentence
   * and the younger one was never heard from at all.
   */
  it("does not always give it to the same one", () => {
    const spoke = new Set<string>();
    for (const roll of [0.05, 0.3, 0.6, 0.95]) {
      const heard = forFrame(JSON.stringify({ type: "heard_text", text: "ciao" }), senders, roll);
      spoke.add(heard[0]?.member.id ?? "");
    }
    expect([...spoke].sort()).toEqual(["nino", "ugo"]);
  });

  it("does not choke on a frame that is not JSON", () => {
    // one gateway still gets it, so the error comes back through the normal
    // path instead of the socket silently swallowing it
    expect(forFrame("{ not json", senders)).toHaveLength(1);
  });

  it("treats an unknown frame type as one creature's business, not the room's", () => {
    expect(forFrame(JSON.stringify({ type: "something_new" }), senders)).toHaveLength(1);
  });

  it("leaves the lone creature's frames untagged, as every older face expects", () => {
    // `who: ""` would be noise standing for "the only one", and it broke three
    // integration tests that compare the greeting frame exactly — rightly, so:
    // a house with one creature must speak the wire format it always spoke.
    expect(tagFor("")).toBeUndefined();
    expect(tagFor("nino")).toBe("nino");
  });

  it("is harmless in a room with a single creature", () => {
    const alone = [{ id: "ugo", member: { id: "ugo" } }];
    expect(forFrame(JSON.stringify({ type: "noise", db: 70 }), alone)).toHaveLength(1);
    expect(forFrame(JSON.stringify({ type: "heard_text", text: "ciao" }), alone)).toHaveLength(1);
  });
});
