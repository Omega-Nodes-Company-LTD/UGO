/**
 * Homeostasis engine data model (PROGETTO §5.3).
 * Pure TypeScript: no I/O, no clocks — time always comes in as a parameter,
 * which keeps the whole character deterministic and unit-testable.
 *
 * Every variable lives in [0,1] and follows
 *   v(t+Δt) = baseline + (v(t) − baseline)·e^(−Δt/τ) + Σ perturbations
 * We represent the state as the *sum of decaying transients* over the
 * baseline: each perturbation carries its own τ (defaulting to the
 * variable's τ), so a noise spike (τ 15 min) fades faster than heat stress
 * without extra machinery.
 */

export const PSYCHE_VARIABLES = [
  "energia",
  "umore",
  "affetto",
  "noia",
  "stress",
  "curiosita",
] as const;
export type PsycheVariable = (typeof PSYCHE_VARIABLES)[number];

export type PsycheVars = Record<PsycheVariable, number>;

export interface PsycheTransient {
  variable: PsycheVariable;
  /** signed perturbation amount at application time */
  amount: number;
  tauHours: number;
  appliedAtMs: number;
}

export interface PsycheState {
  transients: PsycheTransient[];
  /** last significant event type, used for event-flavoured labels */
  lastEventType?: string | undefined;
}

/** Variable time constants τ, in hours (PROGETTO §5.3 table). */
export const TAU_HOURS: Record<PsycheVariable, number> = {
  energia: 4,
  umore: 12,
  affetto: 24,
  noia: 6,
  stress: 2,
  curiosita: 24,
};

/** Static baselines; energia is circadian and handled separately. */
export const BASELINES: Record<Exclude<PsycheVariable, "energia">, number> = {
  umore: 0.55,
  affetto: 0.5,
  noia: 0.4,
  stress: 0.3,
  curiosita: 0.5,
};

export const ENERGY_DAY_BASELINE = 0.7;
export const ENERGY_NIGHT_BASELINE = 0.2;
/** Day window [start, end) for the circadian energia baseline. */
export const DAY_HOURS: readonly [number, number] = [7, 23];

/**
 * Adaptive baselines (ADR-012): persisted in psyche_baselines and passed in
 * as overrides — the engine stays pure. `energia` remains circadian and
 * ignores overrides by design.
 */
export type BaselineOverrides = Partial<Record<Exclude<PsycheVariable, "energia">, number>>;

export function baselineFor(
  variable: PsycheVariable,
  hourOfDay: number,
  overrides?: BaselineOverrides,
): number {
  if (variable === "energia") {
    const [dayStart, dayEnd] = DAY_HOURS;
    return hourOfDay >= dayStart && hourOfDay < dayEnd ? ENERGY_DAY_BASELINE : ENERGY_NIGHT_BASELINE;
  }
  return overrides?.[variable] ?? BASELINES[variable];
}

export function emptyState(): PsycheState {
  return { transients: [] };
}
