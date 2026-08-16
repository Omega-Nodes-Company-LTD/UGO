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
 * How easily he startles (ADR-041).
 *
 * The owner: «non può sentire ogni mia parola come botto». He is right, and
 * the uncomfortable part is that **no threshold fixes it**: a voice at a metre
 * really does sit 25-30 dB over a quiet room's floor, which is what a bang is.
 * Any level that still lets a dropped pan through lets a sentence through with
 * it, and one high enough to stop speech has made him deaf to the pan.
 *
 * So the level is not asked to do that job. `hushUntil` is — the recognizer
 * knows the loud thing happening right now is a voice, which is information no
 * level meter can produce for itself. The threshold keeps doing what it always
 * did (telling a bang from the room), and becomes a **setting** because how
 * loud a room is, is a fact about the room: a study and a kitchen with a
 * television in it do not want the same answer, and only the owner knows which
 * one this screen is standing in.
 */
export type NoiseSensitivity = "alta" | "media" | "bassa" | "spenta";

export const SENSITIVITIES: Readonly<
  Record<NoiseSensitivity, { jumpDb: number; floorDb: number }>
> = {
  /** the ADR-029 numbers: a quiet house where anything sudden matters */
  alta: { jumpDb: 12, floorDb: 45 },
  /** the default: a door, a dropped pan, a dog — a lived-in room */
  media: { jumpDb: 14, floorDb: 50 },
  /**
   * a kitchen with a television in it, a workshop, a road outside.
   *
   * Alzata (2026-08-16) dopo il campo: col vecchio 22/60 il proprietario lo
   * vedeva ancora «spaventato dal fracasso» in una stanza DICHIARATA
   * rumorosa. Una voce alta a un metro fa ~25 dB sopra il pavimento: qui
   * deve passare senza far saltare nessuno, e ci vuole un botto vero.
   */
  bassa: { jumpDb: 28, floorDb: 72 },
  /** he still hears the room, he simply never jumps at it */
  spenta: { jumpDb: Infinity, floorDb: Infinity },
};

export const DEFAULT_SENSITIVITY: NoiseSensitivity = "media";
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
/** After firing, the level must fall back to within this fraction of the step. */
const REARM_FRACTION = 0.5;

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
  private jumpDb: number;
  private floorDb: number;
  private hushedUntilMs = -Infinity;
  private level = 0;
  private baseline = 0;
  private startedAtMs: number | undefined;
  private lastPushAtMs = 0;
  private lastFiredAtMs = -Infinity;
  private warm = false;
  /** false between a startle and the room settling down again */
  private armed = true;

  public constructor(sensitivity: NoiseSensitivity = DEFAULT_SENSITIVITY) {
    const chosen = SENSITIVITIES[sensitivity];
    this.jumpDb = chosen.jumpDb;
    this.floorDb = chosen.floorDb;
  }

  /** Change it without losing the room the gate has already learned. */
  public setSensitivity(sensitivity: NoiseSensitivity): void {
    const chosen = SENSITIVITIES[sensitivity];
    this.jumpDb = chosen.jumpDb;
    this.floorDb = chosen.floorDb;
  }

  /**
   * "That was a voice, not a bang" — keep quiet until `untilMs`.
   *
   * The recognizer knows something the level meter cannot: that the loud thing
   * currently happening is somebody talking. A threshold alone can only ever
   * trade "startles at speech" against "never startles", and this is the
   * information that makes the trade unnecessary.
   */
  public hushUntil(untilMs: number): void {
    this.hushedUntilMs = Math.max(this.hushedUntilMs, untilMs);
  }

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
    if (!this.armed && jump < this.jumpDb * REARM_FRACTION) this.armed = true;

    const startled =
      this.warm &&
      this.armed &&
      now >= this.hushedUntilMs &&
      jump >= this.jumpDb &&
      this.level >= this.floorDb &&
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
