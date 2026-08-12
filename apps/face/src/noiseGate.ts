/**
 * The noise gate — PURE, and the reason a creature stops being afraid of his
 * own living room (ADR-029, corrected by ADR-033).
 *
 * A startle is not a loudness, it is a **surprise**: something suddenly much
 * louder than this room usually is. ADR-029 got that framing right and the
 * dynamics wrong, in two ways that only show up on a signal that moves:
 *
 *  1. The floor followed the *instantaneous* frame, and fell four times
 *     faster than it rose. Rooms are not steady — the gap between two
 *     syllables is 20-30 dB deep — so the floor dived into every gap and the
 *     next syllable cleared it by 25 dB. A conversation fired the gate sixty
 *     times in two minutes. The asymmetry was chosen so that a passing lorry
 *     would not leave him deaf, and it is exactly backwards: a floor that
 *     falls fast re-arms the trigger in every pause.
 *  2. One 43 ms frame could fire it, so a click counted as a bang.
 *
 * So: the level is smoothed before it is judged, and the floor now **rises
 * quickly and falls slowly**. Sustained or repetitive noise is absorbed into
 * the room instead of startling him over and over; after a loud episode he
 * stays hard to startle for about a minute. That is not a defect, it is
 * habituation — the same reason a person stops hearing the motorway.
 *
 * All the time constants are in milliseconds and applied against the real
 * elapsed time, not per sample: the caller is a `requestAnimationFrame` loop,
 * which runs at 60 Hz on one phone, 120 Hz on another, and slows to a crawl in
 * a background tab. Per-sample coefficients made the creature's temperament a
 * function of the display's refresh rate.
 */

/**
 * dB above the learned floor that counts as a bang. Slightly under the 14 dB
 * ADR-029 asked for, because the floor is chasing the level while a bang
 * develops and eats about a fifth of it: 12 against a moving floor is roughly
 * 14 of real step.
 */
const JUMP_DB = 12;
/** Below this nothing is ever a startle, however quiet the room was. */
const ABSOLUTE_FLOOR_DB = 45;
/** Smoothing of the measured level: shorter than a syllable, longer than a click. */
const LEVEL_TAU_MS = 120;
/** The floor climbs into a noisy room in a second or two... */
const FLOOR_RISE_TAU_MS = 2_000;
/** ...and leaves it over about a minute, so pauses do not re-arm the trigger. */
const FLOOR_FALL_TAU_MS = 60_000;
/** How long the room is listened to before the gate may fire at all. */
const WARMUP_MS = 3_000;
/** Two bangs closer together than this are one bang. */
const COOLDOWN_MS = 15_000;
/** After firing, the level must fall back to within this of the floor to re-arm. */
const REARM_DB = JUMP_DB / 2;

/** Fraction of the way to move towards a target after `dt` ms, given τ. */
function follow(dtMs: number, tauMs: number): number {
  return 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
}

export interface NoiseReading {
  startled: boolean;
  /** the smoothed level that was judged, for the event payload */
  db: number;
  /** the room's learned floor, for the debug readout */
  baseline: number;
}

export class NoiseGate {
  private level = 0;
  private baseline = 0;
  private startedAtMs: number | undefined;
  private lastPushAtMs = 0;
  private lastFiredAtMs = -Infinity;
  private warm = false;
  /** false between a startle and the room settling down again */
  private armed = true;

  /**
   * @param db  a level in decibels — uncalibrated is fine, only differences
   *            are used, which is exactly why this works on any microphone
   * @param now monotonic milliseconds
   */
  public push(db: number, now: number): NoiseReading {
    if (this.startedAtMs === undefined) {
      this.startedAtMs = now;
      this.lastPushAtMs = now;
      this.level = db;
      this.baseline = db;
      return { startled: false, db, baseline: db };
    }

    const dt = now - this.lastPushAtMs;
    this.lastPushAtMs = now;
    this.level += (db - this.level) * follow(dt, LEVEL_TAU_MS);

    const jump = this.level - this.baseline;
    this.warm = now - this.startedAtMs >= WARMUP_MS;
    // he cannot be startled twice by one continuous noise: the room has to
    // come back down before the next bang counts as a bang
    if (!this.armed && jump < REARM_DB) this.armed = true;

    const startled =
      this.warm &&
      this.armed &&
      jump >= JUMP_DB &&
      this.level >= ABSOLUTE_FLOOR_DB &&
      now - this.lastFiredAtMs >= COOLDOWN_MS;
    if (startled) {
      this.lastFiredAtMs = now;
      this.armed = false;
    }

    const tau = this.level > this.baseline ? FLOOR_RISE_TAU_MS : FLOOR_FALL_TAU_MS;
    this.baseline += (this.level - this.baseline) * follow(dt, tau);

    return { startled, db: this.level, baseline: this.baseline };
  }

  /** True once the room has been listened to long enough to judge it. */
  public get ready(): boolean {
    return this.warm;
  }

  public get floor(): number {
    return this.baseline;
  }
}
