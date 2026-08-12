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

/** Below this a cause is not worth showing to anybody. */
const MIN_VISIBLE = 0.005;

export interface VariableBreakdown {
  /** where the variable rests when nothing is happening to it */
  baseline: number;
  /** what it actually reads, after clamping — the number on the bar */
  value: number;
  /**
   * Live causes, largest first. `cause` is undefined for the single collapsed
   * transient a restart leaves behind (`stateFromSnapshot`): honest, because
   * after a restart nobody knows what it was any more.
   */
  causes: { cause: string | undefined; amount: number }[];
}

/**
 * Why each variable reads what it reads (ADR-034).
 *
 * `varsAt` answers "how stressed is he", which stops being useful the moment
 * the answer is worrying: the next question is always *from what*, and until
 * now that could only be reconstructed by hand from the events table.
 *
 * NB: `value` is clamped and the causes are not, so a variable pinned at 1 has
 * causes summing past it. That is not a rounding error, it is the interesting
 * case — it says how far past the top he would be if there were room.
 */
export function breakdownAt(
  state: PsycheState,
  at: Date,
  hourOfDay?: number,
  overrides?: BaselineOverrides,
): Record<PsycheVariable, VariableBreakdown> {
  const hour = hourOfDay ?? at.getHours();
  const atMs = at.getTime();
  const out = {} as Record<PsycheVariable, VariableBreakdown>;
  for (const variable of PSYCHE_VARIABLES) {
    const baseline = baselineFor(variable, hour, overrides);
    const byCause = new Map<string | undefined, number>();
    let total = 0;
    for (const transient of state.transients) {
      if (transient.variable !== variable) continue;
      const contribution = decayedContribution(transient, atMs);
      total += contribution;
      byCause.set(transient.cause, (byCause.get(transient.cause) ?? 0) + contribution);
    }
    out[variable] = {
      baseline,
      value: clamp01(baseline + total),
      causes: [...byCause]
        .map(([cause, amount]) => ({ cause, amount }))
        .filter((entry) => Math.abs(entry.amount) >= MIN_VISIBLE)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }
  return out;
}

export interface Perturbation {
  variable: PsycheVariable;
  amount: number;
  /** overrides the variable's τ (e.g. a noise spike decays in 15 min) */
  tauHours?: number;
  /**
   * The most this event type may hold on this variable at once — habituation
   * (ADR-033). Without it, repetition simply sums: twenty bangs pin `stress`
   * at 1.0 and hold it there for a quarter of an hour, which is both wrong
   * about animals and useless as a signal, because every reading of a pinned
   * variable is the same reading.
   *
   * Undefined means no habituation, which is the right default: being spoken
   * to a hundred times SHOULD add up.
   */
  ceiling?: number;
}

/** Below this a habituated perturbation is not worth recording at all. */
const MIN_AMOUNT = 0.005;

/** How much of this same event is still live on this variable. */
function alreadyPresent(
  transients: readonly PsycheTransient[],
  variable: PsycheVariable,
  cause: string | undefined,
  atMs: number,
): number {
  let sum = 0;
  for (const transient of transients) {
    if (transient.variable === variable && transient.cause === cause) {
      sum += decayedContribution(transient, atMs);
    }
  }
  return Math.abs(sum);
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
  const added: PsycheTransient[] = [];
  for (const perturbation of perturbations) {
    let amount = perturbation.amount;
    if (perturbation.ceiling !== undefined) {
      // diminishing returns rather than a wall: each repetition lands in
      // proportion to the room left under the ceiling, so the second bang is
      // half the first and the eighth is not worth writing down
      const present = alreadyPresent(kept, perturbation.variable, eventType, atMs);
      const room = Math.max(0, perturbation.ceiling - present);
      amount = perturbation.amount * (room / perturbation.ceiling);
      if (Math.abs(amount) < MIN_AMOUNT) continue;
    }
    added.push({
      variable: perturbation.variable,
      amount,
      tauHours: perturbation.tauHours ?? TAU_HOURS[perturbation.variable],
      appliedAtMs: atMs,
      ...(eventType !== undefined && { cause: eventType }),
    });
  }
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
