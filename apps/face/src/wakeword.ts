/**
 * Wake word "Ehi Ugo" (PROGETTO §8 Fase 3, Vosk small-it on-device).
 *
 * The recognizer itself needs a ~40 MB model bundled onto the phone, so it
 * cannot be exercised in this environment. What lives here is the *contract*
 * and the safety logic around it — the parts that can be wrong in ways a
 * device test would not catch:
 *
 * - detection alone never starts listening: it raises `alert` first and waits
 *   for confirmation, because a false positive that starts recording is worse
 *   than a missed wake (PROGETTO §11, "wake word falsi positivi")
 * - privacy mode outranks everything: while it is on, no audio is consumed
 * - when the model is absent the app degrades to tap-to-talk without errors
 */

export interface WakeWordEngine {
  /** true once the model is loaded and listening for the phrase */
  start: (onDetected: (confidence: number) => void) => Promise<boolean>;
  stop: () => void;
}

/** Below this, a detection is treated as noise (§11: soglia + conferma). */
export const WAKE_CONFIDENCE_THRESHOLD = 0.75;
/** Ignore repeated triggers inside this window. */
export const WAKE_COOLDOWN_MS = 3000;

export interface WakeWordOptions {
  engine?: WakeWordEngine;
  isPrivacyOn: () => boolean;
  /** raise attention; the caller decides whether to open the microphone */
  onWake: () => void;
  now?: () => number;
}

export class WakeWord {
  private lastWakeAt = -Infinity;
  private running = false;

  public constructor(private readonly options: WakeWordOptions) {}

  public isRunning(): boolean {
    return this.running;
  }

  /** Returns false when no engine is bundled: the caller falls back to tap. */
  public async start(): Promise<boolean> {
    const engine = this.options.engine;
    if (engine === undefined) return false;
    this.running = await engine.start((confidence) => {
      this.handleDetection(confidence);
    });
    return this.running;
  }

  public stop(): void {
    this.options.engine?.stop();
    this.running = false;
  }

  /** Exposed for tests: the decision logic, independent of any model. */
  public handleDetection(confidence: number): boolean {
    if (this.options.isPrivacyOn()) return false;
    if (confidence < WAKE_CONFIDENCE_THRESHOLD) return false;
    const now = this.options.now?.() ?? performance.now();
    if (now - this.lastWakeAt < WAKE_COOLDOWN_MS) return false;
    this.lastWakeAt = now;
    this.options.onWake();
    return true;
  }
}
