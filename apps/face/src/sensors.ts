import type { FaceToServerMessage } from "@ugo/shared/face";
import { NoiseGate, DEFAULT_SENSITIVITY, type NoiseSensitivity } from "./noiseGate.js";

/** How long after a voice a sound is still that voice, and not a bang. */
const VOICE_HUSH_MS = 1_500;

type SendFn = (message: FaceToServerMessage) => void;

const SHAKE_COOLDOWN_MS = 3000;
const SHAKE_THRESHOLD = 18; // m/s² beyond gravity-ish
const LIGHT_PERIOD_MS = 60_000;

/**
 * Local senses, zero-token by design (PROGETTO §4.1): reactions are wired
 * locally, only compact events reach soul. Everything starts on explicit
 * user gesture (mic permission) — nothing records silently.
 */
export class Sensors {
  private readonly noise = new NoiseGate(DEFAULT_SENSITIVITY);
  private lastShakeAt = 0;
  private audioContext: AudioContext | undefined;

  public constructor(
    private readonly send: SendFn,
    private readonly onLocalStartle: () => void,
    sensitivity: NoiseSensitivity = DEFAULT_SENSITIVITY,
  ) {
    this.noise.setSensitivity(sensitivity);
  }

  /** The room's learned noise floor, for the debug readout. */
  public noiseFloor(): number {
    return Math.round(this.noise.floor);
  }

  /** How easily he startles (ADR-041). Changing it does not unlearn the room. */
  public setNoiseSensitivity(sensitivity: NoiseSensitivity): void {
    this.noise.setSensitivity(sensitivity);
  }

  /**
   * That was a voice, not a bang. Held a little past the words themselves,
   * because `onspeechend` arrives before the room stops ringing.
   */
  public heardAVoice(): void {
    this.noise.hushUntil(performance.now() + VOICE_HUSH_MS);
  }

  /** microphone level meter → noise events, judged against the room (ADR-029) */
  public async startMicrophone(): Promise<void> {
    // Automatic gain control is ON by default, and it is what made a silent
    // room read as a loud one: AGC amplifies quiet input until it fills the
    // range. For a level meter we want what the room actually did.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false },
    });
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    const tick = (): void => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) sum += sample * sample;
      const rms = Math.sqrt(sum / buffer.length);
      // rough SPL estimate: enough for "sudden loud noise", not metrology
      // uncalibrated on purpose: the gate only ever uses differences, which
      // is what lets the same code work on any microphone
      const db = Math.max(0, 94 + 20 * Math.log10(rms + 1e-8));
      const reading = this.noise.push(db, performance.now());
      if (reading.startled) {
        this.onLocalStartle();
        this.send({ type: "noise", db: Math.round(reading.db) });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** accelerometer bumps → shake events (urto → indignazione) */
  public startMotion(): void {
    window.addEventListener("devicemotion", (event) => {
      const a = event.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      const magnitude = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81);
      const now = performance.now();
      if (magnitude > SHAKE_THRESHOLD && now - this.lastShakeAt > SHAKE_COOLDOWN_MS) {
        this.lastShakeAt = now;
        this.onLocalStartle();
        this.send({ type: "shake" });
      }
    });
  }

  /** ambient light → periodic light events (drives the sleep rule server-side) */
  public startLight(): void {
    interface AmbientLightSensorLike {
      illuminance?: number;
      addEventListener: (type: "reading", cb: () => void) => void;
      start: () => void;
    }
    const Ctor = (
      globalThis as { AmbientLightSensor?: new (init: { frequency: number }) => AmbientLightSensorLike }
    ).AmbientLightSensor;
    if (Ctor === undefined) return; // sensor not available: degrade silently
    try {
      const sensor = new Ctor({ frequency: 1 });
      let lastSentAt = 0;
      sensor.addEventListener("reading", () => {
        const now = performance.now();
        if (now - lastSentAt > LIGHT_PERIOD_MS && sensor.illuminance !== undefined) {
          lastSentAt = now;
          this.send({ type: "light", lux: Math.round(sensor.illuminance) });
        }
      });
      sensor.start();
    } catch {
      // permission or platform issue: no light sense, nothing breaks
    }
  }
}
