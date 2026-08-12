import { describe, expect, it } from "vitest";
import {
  applyPerturbations,
  breakdownAt,
  lastBlowAt,
  stateFromSnapshot,
  varsAt,
} from "./engine.js";
import { perturbationsForEvent } from "./events.js";
import { labelPhrase, pickLabel, STARTLE_WINDOW_MS } from "./labels.js";
import {
  BASELINES,
  ENERGY_DAY_BASELINE,
  ENERGY_NIGHT_BASELINE,
  TAU_HOURS,
  emptyState,
  type PsycheState,
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

  it("habituates to a bang instead of piling stress up to the maximum", () => {
    // A creature that is startled twenty times is not twenty times as
    // frightened: the tenth bang is barely news. Without this, a noisy
    // afternoon pins him at 1.0 — the whole psyche stops meaning anything,
    // because every reading is the same reading.
    let state = emptyState();
    const start = NOON.getTime();
    for (let i = 0; i < 20; i += 1) {
      state = applyPerturbations(
        state,
        perturbationsForEvent("loud_noise"),
        new Date(start + i * 15_000),
        "loud_noise",
      );
    }
    const vars = varsAt(state, new Date(start + 20 * 15_000), 12);
    expect(vars.stress).toBeLessThan(0.8);
    expect(vars.stress).toBe(varsAt(state, new Date(start + 20 * 15_000), 12).stress);
    // but he is genuinely rattled: habituation is not indifference
    expect(vars.stress).toBeGreaterThan(BASELINES.stress + 0.2);
  });

  it("lets the first bang land at full force", () => {
    const once = applyPerturbations(
      emptyState(),
      perturbationsForEvent("loud_noise"),
      NOON,
      "loud_noise",
    );
    expect(varsAt(once, NOON, 12).stress).toBeCloseTo(BASELINES.stress + 0.2, 5);
  });

  it("is frightened again once the room has been quiet for a while", () => {
    let state = emptyState();
    const start = NOON.getTime();
    for (let i = 0; i < 10; i += 1) {
      state = applyPerturbations(
        state,
        perturbationsForEvent("loud_noise"),
        new Date(start + i * 15_000),
        "loud_noise",
      );
    }
    // an hour of quiet later (τ 15 min: nothing is left of it)
    const calm = new Date(start + 3_600_000);
    const before = varsAt(state, calm, 12).stress;
    const again = applyPerturbations(state, perturbationsForEvent("loud_noise"), calm, "loud_noise");
    expect(varsAt(again, calm, 12).stress - before).toBeCloseTo(0.2, 2);
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

  /**
   * ADR-040. This is the bug the owner saw: everybody permanently "spaventato
   * dal fracasso". ADR-033 taught the ENGINE that the tenth bang is not the
   * first and left the LABEL reading only `stress` — which habituation
   * deliberately keeps elevated. The habituated plateau sat above the anxiety
   * threshold, so getting used to the noise could never turn the word off.
   */
  describe("getting used to the noise", () => {
    const bang = (state: PsycheState, at: Date): PsycheState =>
      applyPerturbations(state, perturbationsForEvent("loud_noise"), at, "loud_noise");
    const labelAt = (state: PsycheState, at: Date): string =>
      pickLabel(varsAt(state, at, 12), state.lastEventType, lastBlowAt(state, at, STARTLE_WINDOW_MS));

    it("jumps at the first bang", () => {
      const state = bang(emptyState(), NOON);

      expect(labelAt(state, NOON)).toBe("spaventato dal fracasso");
    });

    it("is still frightened during the burst, not only on its first instant", () => {
      // twenty seconds later the LATEST transient is the second bang, which
      // habituation has already made tiny — reading that one would have him
      // shrug off a fright he is in the middle of
      let state = bang(emptyState(), NOON);
      const soon = new Date(NOON.getTime() + 20_000);
      state = bang(state, soon);

      expect(labelAt(state, soon)).toBe("spaventato dal fracasso");
    });

    it("stops being frightened once the bangs are old news", () => {
      let state = bang(emptyState(), NOON);
      for (let i = 1; i <= 10; i += 1) {
        state = bang(state, new Date(NOON.getTime() + i * 20_000));
      }
      const after = new Date(NOON.getTime() + 10 * 20_000 + STARTLE_WINDOW_MS + 1_000);

      expect(labelAt(state, after)).not.toBe("spaventato dal fracasso");
    });

    it("keeps the habituated plateau BELOW the line where he calls himself tense", () => {
      // the actual defect: 0.30 baseline + a 0.45 ceiling put the plateau at
      // 0.75, above the 0.60 that reads as anxiety. Getting used to something
      // has to be able to end in "fine", or it is not getting used to it.
      let state = emptyState();
      for (let i = 0; i < 30; i += 1) state = bang(state, new Date(NOON.getTime() + i * 20_000));
      const settled = new Date(NOON.getTime() + 30 * 20_000);

      expect(varsAt(state, settled, 12).stress).toBeLessThan(0.6);
      expect(labelAt(state, settled)).toBe("sereno");
    });

    it("is frightened again by a bang after the room has been quiet", () => {
      let state = emptyState();
      for (let i = 0; i < 10; i += 1) state = bang(state, new Date(NOON.getTime() + i * 20_000));
      // half an hour of calm: the habituation has decayed with the transients
      const later = new Date(NOON.getTime() + 40 * 60_000);
      state = bang(state, later);

      expect(labelAt(state, later)).toBe("spaventato dal fracasso");
    });

    it("still says something true when a restart has lost the blows", () => {
      // `stateFromSnapshot` keeps the deviation, not the spikes; without a blow
      // the old flavouring is better than dropping the information
      const vars = { ...varsAt(emptyState(), NOON, 12), stress: 0.8 };

      expect(pickLabel(vars, "loud_noise", undefined)).toBe("spaventato dal fracasso");
      expect(pickLabel(vars, undefined, undefined)).toBe("in ansia");
    });
  });

  it("every label has an Italian phrase", () => {
    for (const label of ["sereno", "mogio", "gasato", "in ansia da caldo", "offeso per l'urto"]) {
      expect(labelPhrase(label).length).toBeGreaterThan(0);
    }
  });
});

describe("breakdownAt", () => {
  /**
   * "Quanto è stressato" smette di servire nel momento esatto in cui la
   * risposta preoccupa: la domanda dopo è sempre *da cosa*.
   */
  it("says what each cause is contributing, largest first", () => {
    let state = applyPerturbations(
      emptyState(),
      perturbationsForEvent("heat_stress"),
      NOON,
      "heat_stress",
    );
    state = applyPerturbations(state, perturbationsForEvent("loud_noise"), NOON, "loud_noise");
    state = applyPerturbations(state, perturbationsForEvent("loud_noise"), NOON, "loud_noise");

    const stress = breakdownAt(state, NOON, 12).stress;
    expect(stress.baseline).toBeCloseTo(BASELINES.stress, 5);
    expect(stress.causes.map((c) => c.cause)).toEqual(["loud_noise", "heat_stress"]);
    // the two bangs are one cause, summed, and habituation has already bitten:
    // 0.20 then 0.04, because ADR-040 lowered the ceiling to 0.25 to keep the
    // habituated plateau under the line where he calls himself tense
    expect(stress.causes[0]?.amount).toBeCloseTo(0.24, 2);
    expect(stress.causes[1]?.amount).toBeCloseTo(0.15, 5);
    expect(stress.value).toBeCloseTo(varsAt(state, NOON, 12).stress, 5);
  });

  it("agrees with varsAt on every variable, which is the only thing that makes it trustworthy", () => {
    let state = emptyState();
    for (const event of ["went_out", "loud_noise", "conversation_turn", "heat_stress"]) {
      state = applyPerturbations(state, perturbationsForEvent(event), NOON, event);
    }
    const later = hoursAfter(NOON, 3);
    const vars = varsAt(state, later, 12);
    const breakdown = breakdownAt(state, later, 12);
    for (const [name, value] of Object.entries(vars)) {
      expect(breakdown[name as keyof typeof vars].value, name).toBeCloseTo(value, 10);
    }
  });

  it("keeps the causes uncapped when the value is pinned, so you can see how far past the top he is", () => {
    const state = applyPerturbations(
      emptyState(),
      [{ variable: "stress", amount: 2 }],
      NOON,
      "assurdo",
    );
    const stress = breakdownAt(state, NOON, 12).stress;
    expect(stress.value).toBe(1);
    expect(stress.causes[0]?.amount).toBe(2);
  });

  it("hides causes too small to mean anything, and shows nothing at rest", () => {
    expect(breakdownAt(emptyState(), NOON, 12).umore.causes).toEqual([]);
    const whisper = applyPerturbations(
      emptyState(),
      [{ variable: "umore", amount: 0.001 }],
      NOON,
      "briciola",
    );
    expect(breakdownAt(whisper, NOON, 12).umore.causes).toEqual([]);
  });

  it("admits it does not know, after a restart", () => {
    // a snapshot collapses everything into one nameless transient per variable
    const restored = stateFromSnapshot(varsAt(emptyState(), NOON, 12), NOON, 12);
    const shaken = applyPerturbations(restored, perturbationsForEvent("shake"), NOON, "shake");
    const causes = breakdownAt(shaken, NOON, 12).stress.causes;
    expect(causes.map((c) => c.cause)).toEqual(["shake"]);
  });
});
