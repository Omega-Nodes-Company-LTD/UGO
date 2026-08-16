import { describe, expect, it } from "vitest";
import { NoiseGate, SENSITIVITIES } from "./noiseGate.js";

/**
 * The bug this exists to prevent: UGO startled by a silent room, over and over.
 * So the assertions that matter are the ones about NOT firing.
 */

/** Feeds a steady level for a while, returning how many times it startled. */
function steady(gate: NoiseGate, db: number, samples: number, from = 0): number {
  let fired = 0;
  for (let i = 0; i < samples; i += 1) {
    if (gate.push(db, from + i * 16).startled) fired += 1;
  }
  return fired;
}

describe("NoiseGate", () => {
  it("never startles at a constant level, however loud the room is", () => {
    for (const level of [20, 45, 62, 80, 95]) {
      const gate = new NoiseGate();
      expect(steady(gate, level, 2000), `${String(level)} dB steady`).toBe(0);
    }
  });

  it("startles at a bang, once", () => {
    const gate = new NoiseGate();
    steady(gate, 40, 300);
    // a bang has to actually be there for a moment: judging a single 43 ms
    // frame is how a click, a tap on the case or one bad sample became a
    // fright. One second of it must fire exactly one startle, no more.
    expect(steady(gate, 70, 60, 300 * 16)).toBe(1);
  });

  it("stays calm while the room is still being learned", () => {
    const gate = new NoiseGate();
    expect(gate.ready).toBe(false);
    // a bang during the warm-up must not fire: he has no idea what normal is
    expect(gate.push(30, 0).startled).toBe(false);
    expect(gate.push(90, 16).startled).toBe(false);
  });

  it("does not treat a gradually louder room as a fright", () => {
    const gate = new NoiseGate();
    steady(gate, 35, 300);
    // the party fills up over a couple of minutes
    let fired = 0;
    let level = 35;
    for (let i = 0; i < 4000; i += 1) {
      level += 0.01;
      if (gate.push(level, (300 + i) * 16).startled) fired += 1;
    }
    expect(fired).toBe(0);
    // and he has adjusted: the floor moved up with the room
    expect(gate.floor).toBeGreaterThan(50);
  });

  it("still hears a bang over a loud room, judged against that room", () => {
    const gate = new NoiseGate();
    steady(gate, 70, 3000);
    expect(steady(gate, 88, 40, 3000 * 16)).toBe(1);
  });

  it("refuses to call a whisper a bang, even in a soundproof room", () => {
    const gate = new NoiseGate();
    steady(gate, 5, 400);
    // twenty decibels above almost nothing is still almost nothing
    expect(gate.push(25, 400 * 16).startled).toBe(false);
  });

  it("stays hard to startle for a while after a lorry, then comes back down", () => {
    const gate = new NoiseGate();
    steady(gate, 40, 300);
    steady(gate, 85, 200, 300 * 16); // the lorry passes
    const raised = gate.floor;
    expect(raised).toBeGreaterThan(70);

    // ADR-029 made the floor fall fast so he would not be deaf after a lorry.
    // That is what re-armed him in every pause of every conversation, so the
    // floor now leaves a loud room slowly, on purpose: ten seconds later he is
    // still calibrated for the street, and a minute later he is not.
    steady(gate, 40, 600, 500 * 16); // ten seconds of empty street
    expect(gate.floor).toBeGreaterThan(raised - 15);
    steady(gate, 40, 6000, 1100 * 16); // a minute and a half
    expect(gate.floor).toBeLessThan(50);
  });

  /**
   * Every test above feeds a CONSTANT level, and that is exactly why the room
   * still frightened him after ADR-029: real rooms are not constant. Speech,
   * a television, cutlery, a keyboard — all of them are loud-quiet-loud, and
   * the gap between two syllables is 20-30 dB deep.
   */
  it("sits through a conversation without being frightened by it", () => {
    const gate = new NoiseGate();
    steady(gate, 35, 300);
    let fired = 0;
    let t = 300 * 16;
    // two minutes of speech: 200 ms of voice, 200 ms of gap
    for (let burst = 0; burst < 300; burst += 1) {
      for (let i = 0; i < 13; i += 1, t += 16) if (gate.push(65, t).startled) fired += 1;
      for (let i = 0; i < 13; i += 1, t += 16) if (gate.push(35, t).startled) fired += 1;
    }
    // the first syllable may well startle him. The other 299 must not.
    expect(fired).toBeLessThanOrEqual(1);
  });

  /**
   * ADR-041. The owner: «non può sentire ogni mia parola come botto».
   *
   * The uncomfortable fact these assert is that **the threshold alone cannot
   * fix it**: a voice at a metre really is 25-30 dB over a quiet room's floor,
   * which is what a bang is. Any level that lets a dropped pan through lets a
   * sentence through with it. So there are two answers, and this is both of
   * them — the recognizer saying "that was a voice", and a knob for the rest.
   */
  describe("a voice is not a bang", () => {
    /** A quiet room, then somebody talking in it. Returns startles. */
    const conversation = (gate: NoiseGate, onVoice?: (t: number) => void): number => {
      steady(gate, 35, 300);
      let fired = 0;
      let t = 300 * 16;
      for (let burst = 0; burst < 40; burst += 1) {
        onVoice?.(t);
        for (let i = 0; i < 13; i += 1, t += 16) if (gate.push(65, t).startled) fired += 1;
        for (let i = 0; i < 13; i += 1, t += 16) if (gate.push(35, t).startled) fired += 1;
      }
      return fired;
    };

    it("is deaf to the whole conversation when the recognizer says it is speech", () => {
      const gate = new NoiseGate();
      // this is the signal a level meter cannot produce for itself, and it is
      // the difference between "startles at every sentence" and "never startles"
      const fired = conversation(gate, (t) => {
        gate.hushUntil(t + 1_500);
      });

      expect(fired).toBe(0);
    });

    it("still jumps at a door slam during a hushed conversation once the hush lapses", () => {
      const gate = new NoiseGate();
      steady(gate, 35, 300);
      let t = 300 * 16;
      for (let burst = 0; burst < 20; burst += 1) {
        gate.hushUntil(t + 400);
        for (let i = 0; i < 13; i += 1, t += 16) gate.push(65, t);
        for (let i = 0; i < 13; i += 1, t += 16) gate.push(35, t);
      }
      // nobody is talking now, and the door goes
      let fired = 0;
      for (let i = 0; i < 20; i += 1, t += 16) if (gate.push(95, t).startled) fired += 1;

      expect(fired).toBe(1);
    });

    it("lets a noisy room be declared, so the television is furniture", () => {
      // a room with a TV in it: 60 dB of it, and a raised voice over the top
      const noisy = new NoiseGate("bassa");
      steady(noisy, 60, 400);
      expect(steady(noisy, 78, 40, 400 * 16)).toBe(0);

      // the same room at the sensitive setting does startle: the knob is real
      const jumpy = new NoiseGate("alta");
      steady(jumpy, 60, 400);
      expect(steady(jumpy, 78, 40, 400 * 16)).toBe(1);
      // and the default sits between them, which is what "media" has to mean
      const usual = new NoiseGate();
      steady(usual, 60, 400);
      expect(steady(usual, 78, 40, 400 * 16)).toBe(1);
    });

    it("in stanza rumorosa una voce alta non è un botto (2026-08-16)", () => {
      // il campo: «ha paura del rumore anche se impostato su stanza
      // rumorosa». Una voce alta a un metro fa ~25 dB sopra il pavimento:
      // a «bassa» deve passare, a «media» può ancora far saltare
      const tough = new NoiseGate("bassa");
      steady(tough, 48, 400);
      expect(steady(tough, 73, 40, 400 * 16)).toBe(0);

      const usual = new NoiseGate("media");
      steady(usual, 48, 400);
      expect(steady(usual, 73, 40, 400 * 16)).toBe(1);
    });

    it("never startles at all when the owner says so", () => {
      const off = new NoiseGate("spenta");
      steady(off, 30, 300);

      expect(steady(off, 110, 100, 300 * 16)).toBe(0);
    });

    it("changing the setting does not make him unlearn the room", () => {
      const gate = new NoiseGate("alta");
      steady(gate, 55, 400);
      const learned = gate.floor;

      gate.setSensitivity("bassa");

      expect(gate.floor).toBeCloseTo(learned, 5);
      expect(gate.ready).toBe(true);
    });

    it("is ordered from jumpy to deaf, which is what the labels promise", () => {
      const steps = [SENSITIVITIES.alta, SENSITIVITIES.media, SENSITIVITIES.bassa];
      for (let i = 1; i < steps.length; i += 1) {
        const [previous, current] = [steps[i - 1], steps[i]];
        if (previous === undefined || current === undefined) throw new Error("missing step");
        expect(current.jumpDb).toBeGreaterThan(previous.jumpDb);
        expect(current.floorDb).toBeGreaterThan(previous.floorDb);
      }
      expect(SENSITIVITIES.spenta.jumpDb).toBe(Infinity);
    });
  });

  it("still hears a real bang over that conversation", () => {
    const gate = new NoiseGate();
    steady(gate, 35, 300);
    let t = 300 * 16;
    for (let burst = 0; burst < 60; burst += 1) {
      for (let i = 0; i < 13; i += 1, t += 16) gate.push(65, t);
      for (let i = 0; i < 13; i += 1, t += 16) gate.push(35, t);
    }
    // a door slams in the middle of it
    let fired = 0;
    for (let i = 0; i < 20; i += 1, t += 16) if (gate.push(92, t).startled) fired += 1;
    expect(fired).toBe(1);
  });
});
