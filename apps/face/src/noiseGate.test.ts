import { describe, expect, it } from "vitest";
import { NoiseGate } from "./noiseGate.js";

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
    const bang = gate.push(70, 300 * 16);
    expect(bang.startled).toBe(true);
    // and not again for the whole bang, which lasts more than one frame
    let more = 0;
    for (let i = 1; i < 60; i += 1) {
      if (gate.push(70, 300 * 16 + i * 16).startled) more += 1;
    }
    expect(more).toBe(0);
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
    expect(gate.push(88, 3000 * 16).startled).toBe(true);
  });

  it("refuses to call a whisper a bang, even in a soundproof room", () => {
    const gate = new NoiseGate();
    steady(gate, 5, 400);
    // twenty decibels above almost nothing is still almost nothing
    expect(gate.push(25, 400 * 16).startled).toBe(false);
  });

  it("comes back down quickly after a lorry, instead of going deaf", () => {
    const gate = new NoiseGate();
    steady(gate, 40, 300);
    steady(gate, 85, 200, 300 * 16); // the lorry passes
    const raised = gate.floor;
    steady(gate, 40, 600, 500 * 16); // the street empties
    expect(gate.floor).toBeLessThan(raised);
  });
});
