import { NOISE_ALERT_DB, type FaceToServerMessage } from "@ugo/shared/face";

type SendFn = (message: FaceToServerMessage) => void;

const NOISE_COOLDOWN_MS = 2000;
const SHAKE_COOLDOWN_MS = 3000;
const SHAKE_THRESHOLD = 18; // m/s² beyond gravity-ish
const LIGHT_PERIOD_MS = 60_000;

/**
 * Local senses, zero-token by design (PROGETTO §4.1): reactions are wired
 * locally, only compact events reach soul. Everything starts on explicit
 * user gesture (mic permission) — nothing records silently.
 */
export class Sensors {
  private lastNoiseAt = 0;
  private lastShakeAt = 0;
  private audioContext: AudioContext | undefined;

  public constructor(
    private readonly send: SendFn,
    private readonly onLocalStartle: () => void,
  ) {}

  /** microphone level meter → noise events over threshold */
  public async startMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      const db = Math.max(0, 94 + 20 * Math.log10(rms + 1e-8));
      const now = performance.now();
      if (db >= NOISE_ALERT_DB && now - this.lastNoiseAt > NOISE_COOLDOWN_MS) {
        this.lastNoiseAt = now;
        this.onLocalStartle();
        this.send({ type: "noise", db: Math.round(db) });
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
