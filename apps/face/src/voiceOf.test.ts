import { describe, expect, it } from "vitest";
import { voiceOf } from "./speech.js";

/**
 * A voice per creature (ADR-037).
 *
 * The failure this prevents is not a crash: it is a room where two creatures
 * speak and you cannot tell which one did. Pure, so a unit test is the right
 * instrument (TESTING_PLAYBOOK §1).
 */
describe("voiceOf", () => {
  it("leaves a house with one creature sounding exactly as it did", () => {
    expect(voiceOf(undefined)).toEqual({ pitch: 1.35, rate: 1.05 });
    expect(voiceOf("")).toEqual({ pitch: 1.35, rate: 1.05 });
  });

  it("is the same voice every time, on every device", () => {
    expect(voiceOf("ugo")).toEqual(voiceOf("ugo"));
  });

  it("gives two creatures voices you can tell apart", () => {
    const heard = new Set(
      ["ugo", "nino", "silvio", "pina"].map((id) => JSON.stringify(voiceOf(id))),
    );
    expect(heard.size).toBe(4);
  });

  it("keeps everybody sounding like a small pig", () => {
    for (const id of ["a", "bb", "ccc", "un-id-molto-lungo-come-un-uuid"]) {
      const { pitch, rate } = voiceOf(id);
      expect(pitch, id).toBeGreaterThanOrEqual(1.15);
      expect(pitch, id).toBeLessThanOrEqual(1.6);
      expect(rate, id).toBeGreaterThanOrEqual(0.95);
      expect(rate, id).toBeLessThanOrEqual(1.2);
    }
  });
});
