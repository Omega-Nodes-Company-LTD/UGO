import type { FaceState } from "@ugo/shared/face";
import type { FaceRenderer } from "./body/faceRenderer.js";
import type { PsycheVars } from "./body/pose.js";

interface MoodView {
  label: string;
  /** umore drives the ears: dritte = gasato, afflosciate = mogio */
  umore: number;
  stress: number;
}

export interface GazeTarget {
  x: number; // [-1, 1]
  y: number; // [-1, 1]
}

/**
 * How fast the eyes catch up with the target, per frame at 60fps. Locked to
 * the target they were unnerving: a real gaze arrives late and overshoots
 * nothing.
 */
const GAZE_EASING = 0.12;
/** Every so often the eyes wander off by themselves, like anyone's do. */
const GLANCE_EVERY_MS = 4200;
const GLANCE_SPREAD_MS = 3500;
const GLANCE_LASTS_MS = 700;

/**
 * Low-poly pig face on canvas: eyes with gaze-follow, mood ears, snout.
 *
 * Still here on purpose (ADR-026): it is the fallback for a device without
 * WebGL, for headless rendering with no GPU, and for the day the battery says
 * no to the 3D body. It reads the same interface, so nothing above it knows.
 */
export class Canvas2dFace implements FaceRenderer {
  private mood: MoodView = { label: "", umore: 0.55, stress: 0.3 };
  private state: FaceState = "idle";
  /** where the eyes are told to look */
  private gaze: GazeTarget = { x: 0, y: 0 };
  /** where they actually are: they lag, and sometimes they wander off */
  private eyes: GazeTarget = { x: 0, y: 0 };
  private glanceUntil = 0;
  private glance: GazeTarget = { x: 0, y: 0 };
  private nextGlanceAt = performance.now() + GLANCE_EVERY_MS;
  private blinkUntil = 0;
  private nextBlinkAt = performance.now() + 3000;
  private raf = 0;
  private lowPower = false;
  private lastDrawAt = 0;

  public constructor(private readonly canvas: HTMLCanvasElement) {}

  /** portable mode (§4.2): fondo nero, animazioni ridotte, ~2 fps in idle */
  public setLowPower(on: boolean): void {
    this.lowPower = on;
  }

  public setMood(label: string, vars: Partial<PsycheVars>): void {
    this.mood = {
      label,
      umore: vars.umore ?? this.mood.umore,
      stress: vars.stress ?? this.mood.stress,
    };
  }

  /** The 2D face has no gesture layer; reacting is the 3D body's job. */
  public reflex(): void {
    // intentionally empty: nothing to play here
  }

  public readonly debug = (): Record<string, string | number> => ({
    state: this.state,
    mood: this.mood.label,
    renderer: "2d",
  });

  public setState(state: FaceState): void {
    this.state = state;
  }

  /**
   * `null` = nessuno in vista: gli occhi tornano davanti invece di restare
   * puntati dove eri l'ultima volta. Il corpo 2D non ruota, quindi qui non
   * serve la conversione di `attention.ts`: lo schermo *è* il suo sistema.
   */
  public setGaze(target: GazeTarget | null): void {
    this.gaze = target ?? { x: 0, y: 0 };
  }

  public start(): void {
    const loop = (now: number): void => {
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  public stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private draw(now: number): void {
    // low power: redraw at ~2 fps unless the state animates (talking/listening)
    if (
      this.lowPower &&
      this.state !== "talking" &&
      this.state !== "listening" &&
      now - this.lastDrawAt < 500
    ) {
      return;
    }
    this.lastDrawAt = now;
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth * dpr;
    const h = this.canvas.clientHeight * dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const unit = Math.min(w, h) / 10;

    // ears: rotation from umore (up when happy, floppy when low)
    const earLift = (this.mood.umore - 0.5) * 1.2 + (this.state === "alert" ? 0.4 : 0);
    ctx.fillStyle = "#e8a0b4";
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * unit * 2.2, cy - unit * 2.6);
      ctx.rotate(side * (0.5 - earLift * 0.6));
      ctx.beginPath();
      ctx.moveTo(-unit * 0.7, unit * 0.8);
      ctx.lineTo(0, -unit * 1.6);
      ctx.lineTo(unit * 0.7, unit * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // head
    ctx.fillStyle = "#f2b8c6";
    ctx.beginPath();
    ctx.ellipse(cx, cy, unit * 3.4, unit * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // eyes: they follow late, and now and then they look away on their own —
    // a pupil welded to the pointer reads as a stare, not as attention
    if (now > this.nextGlanceAt) {
      this.glanceUntil = now + GLANCE_LASTS_MS;
      this.nextGlanceAt = now + GLANCE_EVERY_MS + Math.random() * GLANCE_SPREAD_MS;
      this.glance = { x: (Math.random() - 0.5) * 1.4, y: (Math.random() - 0.5) * 0.8 };
    }
    const looking = now < this.glanceUntil ? this.glance : this.gaze;
    this.eyes = {
      x: this.eyes.x + (looking.x - this.eyes.x) * GAZE_EASING,
      y: this.eyes.y + (looking.y - this.eyes.y) * GAZE_EASING,
    };

    const sleeping = this.state === "sleeping";
    if (now > this.nextBlinkAt) {
      this.blinkUntil = now + 120;
      this.nextBlinkAt = now + 2500 + Math.random() * 3000;
    }
    const blinking = now < this.blinkUntil;
    for (const side of [-1, 1]) {
      const ex = cx + side * unit * 1.3;
      const ey = cy - unit * 0.8;
      if (sleeping || blinking) {
        ctx.strokeStyle = "#5a2a38";
        ctx.lineWidth = unit * 0.12;
        ctx.beginPath();
        ctx.moveTo(ex - unit * 0.5, ey);
        ctx.quadraticCurveTo(ex, ey + unit * 0.3, ex + unit * 0.5, ey);
        ctx.stroke();
      } else {
        const wide = this.state === "alert" ? 1.25 : 1;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(ex, ey, unit * 0.62 * wide, unit * 0.72 * wide, 0, 0, Math.PI * 2);
        ctx.fill();
        // pupils follow the eased position — l'effetto "mi vede" (§4.1)
        const px = ex + this.eyes.x * unit * 0.28;
        const py = ey + this.eyes.y * unit * 0.28 - (this.state === "thinking" ? unit * 0.2 : 0);
        ctx.fillStyle = "#2a1a20";
        ctx.beginPath();
        ctx.ellipse(px, py, unit * 0.26, unit * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // snout: quivers while listening, opens while talking
    const quiver = this.state === "listening" ? Math.sin(now / 60) * unit * 0.06 : 0;
    ctx.fillStyle = "#e08aa2";
    ctx.beginPath();
    ctx.ellipse(cx + quiver, cy + unit * 0.9, unit * 1.15, unit * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a4a5c";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * unit * 0.4 + quiver, cy + unit * 0.9, unit * 0.14, unit * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.state === "talking") {
      const open = (Math.sin(now / 90) + 1) / 2;
      ctx.fillStyle = "#5a2a38";
      ctx.beginPath();
      ctx.ellipse(cx, cy + unit * 2.1, unit * 0.7, unit * (0.15 + open * 0.35), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sleeping) {
      ctx.fillStyle = "#cfcfe0";
      ctx.font = `${String(Math.round(unit * 0.8))}px system-ui`;
      ctx.fillText("z z z", cx + unit * 2.2, cy - unit * 2.2);
    }
  }
}
