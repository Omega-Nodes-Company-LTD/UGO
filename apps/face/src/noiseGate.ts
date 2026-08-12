/**
 * The noise gate — PURE, and the fix for a creature that was frightened of a
 * silent room (ADR-029).
 *
 * The old rule was an absolute one: "over 80 dB, startle". Two things made it
 * fire constantly in a quiet room:
 *
 *  1. `getUserMedia({audio: true})` turns on **automatic gain control** by
 *     default. AGC exists to make quiet speech audible, so it amplifies a
 *     silent room until the signal fills the range — the level meter then
 *     reads a library as though it were a rock concert. The absolute number
 *     was measuring the microphone's ambition, not the room.
 *  2. Even without AGC, `94 + 20·log10(rms)` assumes a calibrated capsule.
 *     Phone microphones are not calibrated, and the offset is per device.
 *
 * A startle is not a loudness, it is a **surprise**: something suddenly much
 * louder than this room usually is. So the gate learns the room's floor and
 * fires on the jump above it. A room that gets gradually louder is a party,
 * not a fright, and it must not startle him — which is why the floor climbs
 * slowly and drops quickly.
 */

/** dB above the learned floor that counts as a bang. */
const JUMP_DB = 14;
/** Below this nothing is ever a startle, however quiet the room was. */
const ABSOLUTE_FLOOR_DB = 45;
/**
 * How fast the floor follows the room. Named for what they do: it drops
 * quickly when the room quietens (so a passing lorry does not leave him deaf
 * for a minute) and climbs slowly when it gets louder (so a party raises the
 * bar instead of startling him over and over).
 */
const FOLLOW_DOWN = 0.02;
const FOLLOW_UP = 0.004;
/** Samples to learn the room before the gate is allowed to fire at all. */
const WARMUP_SAMPLES = 120;
const COOLDOWN_MS = 2000;

export interface NoiseReading {
  startled: boolean;
  /** the level that was measured, for the event payload */
  db: number;
  /** the room's learned floor, for the debug readout */
  baseline: number;
}

export class NoiseGate {
  private baseline = 0;
  private samples = 0;
  private lastFiredAt = -Infinity;

  /**
   * @param db  a level in decibels — uncalibrated is fine, only differences
   *            are used, which is exactly why this works on any phone
   * @param now monotonic milliseconds
   */
  public push(db: number, now: number): NoiseReading {
    if (this.samples === 0) this.baseline = db;
    this.samples += 1;

    const warm = this.samples > WARMUP_SAMPLES;
    const jump = db - this.baseline;
    const startled =
      warm &&
      jump >= JUMP_DB &&
      db >= ABSOLUTE_FLOOR_DB &&
      now - this.lastFiredAt > COOLDOWN_MS;
    if (startled) this.lastFiredAt = now;

    const rate = db < this.baseline ? FOLLOW_DOWN : FOLLOW_UP;
    this.baseline += (db - this.baseline) * rate;

    return { startled, db, baseline: this.baseline };
  }

  /** True once the room has been listened to long enough to judge it. */
  public get ready(): boolean {
    return this.samples > WARMUP_SAMPLES;
  }

  public get floor(): number {
    return this.baseline;
  }
}
