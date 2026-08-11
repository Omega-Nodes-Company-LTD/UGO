import type { FaceState } from "@ugo/shared/face";
import type { Posture } from "./channels.js";
import { type GesturePlayer, type Tag, gesturesFor } from "./gestures.js";
import type { PsycheVars } from "./pose.js";

/**
 * Autonomy: the body does things nobody asked it to.
 *
 * Everything here is local and costs zero tokens (PROGETTO §4.1). soul says
 * *what state* UGO is in; what he does with his ears while he is in it is his
 * own business, and it has to keep happening or he reads as a paused video.
 *
 * The choice is weighted by the psyche, so the fidgeting is *in character*:
 * a bored UGO sighs and stares at nothing, a stressed one shivers, a fond one
 * wags. Same machinery, different distribution.
 */

/** Weight of each theme given the psyche. Pure: this is the testable part. */
export function tagWeights(state: FaceState, vars: PsycheVars): Record<Tag, number> {
  const sleeping = state === "sleeping";
  if (sleeping) {
    return {
      calm: 0.2, sleepy: 1, bored: 0, happy: 0, affection: 0,
      alert: 0, curious: 0, stress: vars.stress * 0.2, nose: 0.05,
      speech: 0, wake: 0,
    };
  }
  return {
    calm: 0.55,
    sleepy: Math.max(0, 0.7 - vars.energia) * 2,
    bored: Math.max(0, vars.noia - 0.35) * 2.2,
    happy: Math.max(0, vars.umore - 0.55) * 2.4,
    affection: Math.max(0, vars.affetto - 0.45) * 1.8,
    alert: state === "alert" ? 2.5 : 0.12,
    curious: Math.max(0, vars.curiosita - 0.4) * 1.6 + (state === "listening" ? 0.8 : 0),
    stress: Math.max(0, vars.stress - 0.35) * 2.6,
    nose: 0.35,
    speech: state === "talking" ? 1.4 : 0,
    wake: 0,
  };
}

/** Milliseconds until the next spontaneous gesture. Pure. */
export function nextDelayMs(state: FaceState, vars: PsycheVars): number {
  if (state === "sleeping") return 6000 + Math.random() * 9000;
  // restless = fidgets often; flat and tired = long stretches of nothing
  const restless = vars.noia * 0.5 + vars.energia * 0.35 + vars.stress * 0.4;
  const base = 9000 - restless * 5500;
  return Math.max(1800, base * (0.6 + Math.random() * 0.9));
}

function pickTag(weights: Record<Tag, number>): Tag | undefined {
  const entries = Object.entries(weights).filter(([, w]) => w > 0) as [Tag, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return undefined;
  let roll = Math.random() * total;
  for (const [tag, w] of entries) {
    roll -= w;
    if (roll <= 0) return tag;
  }
  return entries[entries.length - 1]?.[0];
}

/** Reactions that must not wait for the timer. */
export const REFLEX: Readonly<Record<string, string>> = {
  noise: "startle",
  shake: "shakeOff",
  tap: "happyGrunt",
  wake: "wakeStart",
  greet: "earFan",
};

export class Autonomy {
  private nextAt = 0;
  /** ids played recently, so he does not sigh four times in a row */
  private recent: string[] = [];

  public constructor(private readonly player: GesturePlayer) {}

  /**
   * An event happened: react now, and push the idle timer back.
   * Accepts either an event name (`noise`, `tap`) or a gesture id directly,
   * which is what the e2e hooks and the bench use.
   */
  public reflex(kind: string, now: number): void {
    const id = REFLEX[kind] ?? kind;
    if (!this.player.play(id, now)) return;
    this.nextAt = now + 2500;
  }

  public tick(now: number, state: FaceState, vars: PsycheVars, posture: Posture): void {
    if (this.nextAt === 0) this.nextAt = now + nextDelayMs(state, vars);
    if (now < this.nextAt || this.player.busy) return;

    const tag = pickTag(tagWeights(state, vars));
    if (tag !== undefined) {
      const pool = gesturesFor(tag, posture).filter((spec) => !this.recent.includes(spec.id));
      const choice = pool.length > 0 ? pool : gesturesFor(tag, posture);
      const spec = choice[Math.floor(Math.random() * choice.length)];
      if (spec !== undefined) {
        this.player.play(spec.id, now);
        this.recent = [spec.id, ...this.recent].slice(0, 5);
      }
    }
    this.nextAt = now + nextDelayMs(state, vars);
  }
}
