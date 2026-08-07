import type { FaceState } from "@ugo/shared/face";

export interface MoodView {
  label: string;
  /** umore drives the ears: dritte = gasato, afflosciate = mogio */
  umore: number;
  stress: number;
}

export interface GazeTarget {
  x: number; // [-1, 1]
  y: number; // [-1, 1]
}

/** Low-poly pig face on canvas: eyes with gaze-follow, mood ears, snout. */
export class FaceRenderer {
  private mood: MoodView = { label: "", umore: 0.55, stress: 0.3 };
  private state: FaceState = "idle";
  private gaze: GazeTarget = { x: 0, y: 0 };
  private blinkUntil = 0;
  private nextBlinkAt = performance.now() + 3000;
  private raf = 0;

  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public setMood(mood: MoodView): void {
    this.mood = mood;
  }

  public setState(state: FaceState): void {
    this.state = state;
  }

  public setGaze(target: GazeTarget): void {
    this.gaze = target;
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

    // eyes
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
        // pupils follow the gaze target — l'effetto "mi vede" (§4.1)
        const px = ex + this.gaze.x * unit * 0.28;
        const py = ey + this.gaze.y * unit * 0.28 - (this.state === "thinking" ? unit * 0.2 : 0);
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
