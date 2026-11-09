import { describe, expect, it } from "vitest";
import { SPEAKING_VOICES, speakingVoice } from "./voice.js";

describe("the speaking voice comes from the body (ADR-126)", () => {
  it("keeps the pool ordered from the highest measured pitch to the lowest", () => {
    const hz = SPEAKING_VOICES.map((voice) => voice.medianHz);
    expect(hz).toEqual([...hz].sort((a, b) => b - a));
  });

  it("never lists a voice OpenRouter refuses", () => {
    const names = SPEAKING_VOICES.map((voice) => voice.name);
    expect(names).not.toContain("aria");
    expect(names).not.toContain("charlotte");
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives a big body a deeper voice than a small one", () => {
    const small = speakingVoice({ chonk: 0.1, snout: 0.5 });
    const big = speakingVoice({ chonk: 0.95, snout: 0.5 });
    expect(big.medianHz).toBeLessThan(small.medianHz);
  });

  it("lets a long snout darken the voice of the same body", () => {
    const short = speakingVoice({ chonk: 0.5, snout: 0 });
    const long = speakingVoice({ chonk: 0.5, snout: 1 });
    expect(long.medianHz).toBeLessThanOrEqual(short.medianHz);
  });

  it("is deterministic: same body, same voice", () => {
    expect(speakingVoice({ chonk: 0.62, snout: 0.55 })).toEqual(
      speakingVoice({ chonk: 0.62, snout: 0.55 }),
    );
  });

  it("reaches both ends of the pool and stays inside it", () => {
    expect(speakingVoice({ chonk: 0, snout: 0 }).name).toBe(SPEAKING_VOICES.at(0)?.name);
    expect(speakingVoice({ chonk: 1, snout: 1 }).name).toBe(SPEAKING_VOICES.at(-1)?.name);
    expect(speakingVoice({ chonk: 2, snout: -1 })).toBeDefined();
  });

  it("gives the default UGO body a mid-low voice", () => {
    // traitsSchema defaults: chonk 0.62, snout 0.55 — a plain UGO is a sturdy pig
    const plain = speakingVoice({ chonk: 0.62, snout: 0.55 });
    expect(plain.medianHz).toBeLessThan(170);
  });
});
