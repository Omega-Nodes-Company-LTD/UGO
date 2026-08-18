import { expressedTraits, type Genome } from "./genes.js";

/**
 * The arc of a life (ADR-071): the age, and the plasticity that spends itself.
 *
 * Deliberately NOT tiredness — fatigue is borrowed biology on a creature with
 * no body, and it shows. What ages is how much lived days can still rewrite
 * the character: the young one is volatile, the old one has converged. He is
 * not tired, he has finished becoming himself.
 *
 * Pure like the homeostasis engine: time comes in as a parameter.
 */

const MS_PER_DAY = 86_400_000;

/** Hamster scale (VISIONE, orizzonte 6): generations turn within an owner's life. */
export const LIFESPAN_MIN_DAYS = 912; // ~2.5 anni
export const LIFESPAN_MAX_DAYS = 1826; // ~5 anni

/** Where the labels sit on the curve. The curve is the truth; these are names. */
export const CUB_UNTIL = 0.12;
export const ELDER_FROM = 0.7;

/**
 * The nightly baseline step multiplier (ADR-012's ±0.02): a cub takes the day
 * to heart, an elder barely moves. Duplicated in Python (`hygiene.py`) because
 * the drift happens where the night runs; a test compares the two.
 */
export const PLASTICITY_YOUNG = 2.2;
export const PLASTICITY_OLD = 0.15;
/**
 * How fast plasticity falls: at this fraction of life it is halfway down.
 * Measured against the promise, not chosen by taste — at 0.35 an elder still
 * drifted at ~0.46×, which is not "barely moves", and the cross-language test
 * on a real database is what said so.
 */
const PLASTICITY_HALFWAY = 0.22;

export type LifeStage = "cucciolo" | "adulto" | "anziano";

export interface Life {
  ageDays: number;
  lifespanDays: number;
  /** age as a fraction of the expected lifespan, uncapped past 1 */
  fraction: number;
  stage: LifeStage;
  /** multiplier on the nightly baseline drift */
  plasticity: number;
  /** 0 until midlife, then the coat greys — convergence, not decrepitude */
  greying: number;
}

export function lifespanDaysFor(longevity: number): number {
  const t = Math.min(1, Math.max(0, longevity));
  return Math.round(LIFESPAN_MIN_DAYS + (LIFESPAN_MAX_DAYS - LIFESPAN_MIN_DAYS) * t);
}

/**
 * Continuous decay, never steps: a character that jumps overnight because a
 * threshold was crossed would be visible, and false.
 */
export function plasticityAt(fraction: number): number {
  const t = Math.max(0, fraction);
  const decay = Math.exp((-t * Math.LN2) / PLASTICITY_HALFWAY);
  return PLASTICITY_OLD + (PLASTICITY_YOUNG - PLASTICITY_OLD) * decay;
}

export function stageAt(fraction: number): LifeStage {
  if (fraction < CUB_UNTIL) return "cucciolo";
  return fraction >= ELDER_FROM ? "anziano" : "adulto";
}

export function lifeAt(bornAt: Date, now: Date, longevity: number): Life {
  const lifespanDays = lifespanDaysFor(longevity);
  const ageDays = Math.max(0, (now.getTime() - bornAt.getTime()) / MS_PER_DAY);
  const fraction = ageDays / lifespanDays;
  return {
    ageDays,
    lifespanDays,
    fraction,
    stage: stageAt(fraction),
    plasticity: plasticityAt(fraction),
    // grey starts at midlife and saturates at the end of the expected span
    greying: Math.min(1, Math.max(0, (fraction - 0.5) / 0.5)),
  };
}

/** The same, straight from a genome: the longevity gene lives in the catalog. */
export function lifeOf(genome: Genome, bornAt: Date, now: Date): Life {
  return lifeAt(bornAt, now, expressedTraits(genome).longevity);
}
