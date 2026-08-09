import {
  PSYCHE_VARIABLES,
  TAU_HOURS,
  baselineFor,
  type BaselineOverrides,
  type PsycheState,
  type PsycheTransient,
  type PsycheVariable,
  type PsycheVars,
} from "./model.js";

const MS_PER_HOUR = 3_600_000;
/** A transient older than 6τ contributes <0.25% of its amount: prune it. */
const PRUNE_TAU_MULTIPLE = 6;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function decayedContribution(transient: PsycheTransient, atMs: number): number {
  const ageHours = Math.max(0, atMs - transient.appliedAtMs) / MS_PER_HOUR;
  return transient.amount * Math.exp(-ageHours / transient.tauHours);
}

/** Current variable values: baseline(t) + Σ decayed transients, clamped to [0,1]. */
export function varsAt(
  state: PsycheState,
  at: Date,
  hourOfDay?: number,
  overrides?: BaselineOverrides,
): PsycheVars {
  const hour = hourOfDay ?? at.getHours();
  const atMs = at.getTime();
  const vars = {} as PsycheVars;
  for (const variable of PSYCHE_VARIABLES) {
    let value = baselineFor(variable, hour, overrides);
    for (const transient of state.transients) {
      if (transient.variable === variable) {
        value += decayedContribution(transient, atMs);
      }
    }
    vars[variable] = clamp01(value);
  }
  return vars;
}

export interface Perturbation {
  variable: PsycheVariable;
  amount: number;
  /** overrides the variable's τ (e.g. a noise spike decays in 15 min) */
  tauHours?: number;
}

/** Apply perturbations at a point in time, pruning spent transients. */
export function applyPerturbations(
  state: PsycheState,
  perturbations: readonly Perturbation[],
  at: Date,
  eventType?: string,
): PsycheState {
  const atMs = at.getTime();
  const kept = state.transients.filter(
    (t) => atMs - t.appliedAtMs < t.tauHours * PRUNE_TAU_MULTIPLE * MS_PER_HOUR,
  );
  const added: PsycheTransient[] = perturbations.map((p) => ({
    variable: p.variable,
    amount: p.amount,
    tauHours: p.tauHours ?? TAU_HOURS[p.variable],
    appliedAtMs: atMs,
  }));
  return {
    transients: [...kept, ...added],
    lastEventType: eventType ?? state.lastEventType,
  };
}

/**
 * Rebuild an approximate state from a persisted vars snapshot: one transient
 * per variable holding the deviation from baseline with the variable's τ.
 * Per-spike τ fidelity is lost across restarts — an accepted approximation
 * (the sum of decays with equal τ collapses to a single decay).
 */
export function stateFromSnapshot(
  vars: PsycheVars,
  at: Date,
  hourOfDay?: number,
  overrides?: BaselineOverrides,
): PsycheState {
  const hour = hourOfDay ?? at.getHours();
  const transients: PsycheTransient[] = [];
  for (const variable of PSYCHE_VARIABLES) {
    const deviation = vars[variable] - baselineFor(variable, hour, overrides);
    if (Math.abs(deviation) > 1e-4) {
      transients.push({
        variable,
        amount: deviation,
        tauHours: TAU_HOURS[variable],
        appliedAtMs: at.getTime(),
      });
    }
  }
  return { transients };
}
