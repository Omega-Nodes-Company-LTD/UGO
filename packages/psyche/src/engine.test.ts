import { describe, expect, it } from "vitest";
import {
  applyPerturbations,
  stateFromSnapshot,
  varsAt,
} from "./engine.js";
import { perturbationsForEvent } from "./events.js";
import { labelPhrase, pickLabel } from "./labels.js";
import {
  BASELINES,
  ENERGY_DAY_BASELINE,
  ENERGY_NIGHT_BASELINE,
  TAU_HOURS,
  emptyState,
} from "./model.js";

// Pure functions with injected time: legitimate unit-test territory
// (TESTING_PLAYBOOK §1). No clocks are read, no I/O happens.

const NOON = new Date("2026-08-07T12:00:00Z");
const hoursAfter = (base: Date, hours: number): Date =>
  new Date(base.getTime() + hours * 3_600_000);

describe("baseline behaviour", () => {
  it("rests exactly at baseline with no transients", () => {
    const vars = varsAt(emptyState(), NOON, 12);
    expect(vars.umore).toBe(BASELINES.umore);
    expect(vars.stress).toBe(BASELINES.stress);
    expect(vars.energia).toBe(ENERGY_DAY_BASELINE);
  });

  it("energia follows the circadian baseline day/night", () => {
    expect(varsAt(emptyState(), NOON, 12).energia).toBe(ENERGY_DAY_BASELINE);
    expect(varsAt(emptyState(), NOON, 3).energia).toBe(ENERGY_NIGHT_BASELINE);
  });
});

describe("exponential decay toward baseline", () => {
  it("halves the deviation at each τ·ln2", () => {
    const state = applyPerturbations(emptyState(), [{ variable: "stress", amount: 0.4 }], NOON);
    const halfLife = TAU_HOURS.stress * Math.LN2;
    const atHalf = varsAt(state, hoursAfter(NOON, halfLife), 12);
    expect(atHalf.stress).toBeCloseTo(BASELINES.stress + 0.2, 3);
  });

  it("converges to baseline after many τ", () => {
    const state = applyPerturbations(emptyState(), [{ variable: "umore", amount: -0.3 }], NOON);
    const later = varsAt(state, hoursAfter(NOON, TAU_HOURS.umore * 10), 12);
    expect(later.umore).toBeCloseTo(BASELINES.umore, 3);
  });

  it("a loud-noise spike (τ 15 min) fades much faster than heat stress", () => {
    const noise = applyPerturbations(emptyState(), [...perturbationsForEvent("loud_noise")], NOON);
    const heat = applyPerturbations(emptyState(), [...perturbationsForEvent("heat_stress")], NOON);
    const oneHour = hoursAfter(NOON, 1);
    const noiseResidual = varsAt(noise, oneHour, 12).stress - BASELINES.stress;
    const heatResidual = varsAt(heat, oneHour, 12).stress - BASELINES.stress;
    expect(noiseResidual).toBeLessThan(0.005); // e^{-4} of 0.2
    expect(heatResidual).toBeGreaterThan(0.08); // e^{-0.5} of 0.15
  });
});

describe("perturbation application", () => {
  it("is clamped to [0,1]", () => {
    const state = applyPerturbations(
      emptyState(),
      [
        { variable: "stress", amount: 5 },
        { variable: "noia", amount: -5 },
      ],
      NOON,
    );
    const vars = varsAt(state, NOON, 12);
    expect(vars.stress).toBe(1);
    expect(vars.noia).toBe(0);
  });

  it("accumulates repeated conversation turns", () => {
    let state = emptyState();
    for (let i = 0; i < 3; i += 1) {
      state = applyPerturbations(state, perturbationsForEvent("conversation_turn"), NOON);
    }
    const vars = varsAt(state, NOON, 12);
    expect(vars.energia).toBeCloseTo(ENERGY_DAY_BASELINE - 0.06, 5);
    expect(vars.affetto).toBeCloseTo(BASELINES.affetto + 0.15, 5);
  });

  it("prunes spent transients so the state stays bounded", () => {
    let state = emptyState();
    for (let hour = 0; hour < 200; hour += 1) {
      state = applyPerturbations(
        state,
        perturbationsForEvent("loud_noise"),
        hoursAfter(NOON, hour),
      );
    }
    // τ=0.25h transients survive 6τ=1.5h: at most 2 alive plus the fresh one
    expect(state.transients.length).toBeLessThan(5);
  });

  it("is deterministic: same events, same time, same vars", () => {
    const build = (): number =>
      varsAt(
        applyPerturbations(emptyState(), perturbationsForEvent("presence_detected"), NOON),
        hoursAfter(NOON, 2),
        14,
      ).affetto;
    expect(build()).toBe(build());
  });
});

describe("adaptive baselines (ADR-012)", () => {
  it("overrides shift the rest value of non-energia variables", () => {
    const vars = varsAt(emptyState(), NOON, 12, { umore: 0.45 });
    expect(vars.umore).toBe(0.45);
    expect(vars.stress).toBe(BASELINES.stress); // untouched without override
  });

  it("energia stays circadian and ignores overrides by design", () => {
    const vars = varsAt(emptyState(), NOON, 3, { umore: 0.45 });
    expect(vars.energia).toBe(ENERGY_NIGHT_BASELINE);
  });

  it("snapshot round-trip is consistent under overrides", () => {
    const overrides = { umore: 0.5 } as const;
    const state = applyPerturbations(emptyState(), perturbationsForEvent("compliment"), NOON);
    const vars = varsAt(state, NOON, 12, overrides);
    const restored = stateFromSnapshot(vars, NOON, 12, overrides);
    expect(varsAt(restored, NOON, 12, overrides).umore).toBeCloseTo(vars.umore, 4);
  });
});

describe("snapshot round-trip", () => {
  it("rebuilds a state whose vars match the snapshot at restore time", () => {
    let state = emptyState();
    state = applyPerturbations(state, perturbationsForEvent("heat_stress"), NOON);
    state = applyPerturbations(state, perturbationsForEvent("compliment"), NOON);
    const vars = varsAt(state, NOON, 12);
    const restored = stateFromSnapshot(vars, NOON, 12);
    const restoredVars = varsAt(restored, NOON, 12);
    for (const key of Object.keys(vars) as (keyof typeof vars)[]) {
      expect(restoredVars[key]).toBeCloseTo(vars[key], 4);
    }
  });
});

describe("labels", () => {
  it("maps heat stress to the pig-accurate label", () => {
    const state = applyPerturbations(
      emptyState(),
      [...perturbationsForEvent("heat_stress"), ...perturbationsForEvent("heat_stress")],
      NOON,
      "heat_stress",
    );
    const vars = varsAt(state, NOON, 12);
    expect(pickLabel(vars, state.lastEventType)).toBe("in ansia da caldo");
  });

  it("labels the shaken pig as offended", () => {
    const state = applyPerturbations(
      emptyState(),
      [{ variable: "stress", amount: 0.4 }],
      NOON,
      "shake",
    );
    expect(pickLabel(varsAt(state, NOON, 12), state.lastEventType)).toBe("offeso per l'urto");
  });

  it("is sereno at baseline and gasato when umore+energia are high", () => {
    expect(pickLabel(varsAt(emptyState(), NOON, 12))).toBe("sereno");
    const pumped = applyPerturbations(
      emptyState(),
      [
        { variable: "umore", amount: 0.3 },
        { variable: "energia", amount: 0.1 },
      ],
      NOON,
    );
    expect(pickLabel(varsAt(pumped, NOON, 12))).toBe("gasato");
  });

  it("every label has an Italian phrase", () => {
    for (const label of ["sereno", "mogio", "gasato", "in ansia da caldo", "offeso per l'urto"]) {
      expect(labelPhrase(label).length).toBeGreaterThan(0);
    }
  });
});
