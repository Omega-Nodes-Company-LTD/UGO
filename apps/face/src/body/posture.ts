import type { FaceState } from "@ugo/shared/face";
import { type Posture, clamp } from "./channels.js";
import type { PsycheVars } from "./pose.js";

/**
 * Posture is its own axis (PROGETTO §4.1 lists only the six *states*).
 *
 * Standing / sitting / lying / crouching are not six-more-states: they cross
 * with the states. UGO can think lying down, talk sitting, be bored on his
 * feet. That crossing is where the expressive range comes from, and it costs
 * four weights instead of twenty-four enumerated combinations.
 *
 * Weights are blended, never switched: a posture change is a cross-fade, so
 * there is no frame where he teleports from lying to standing.
 */

/** How long a posture must be held before another can be chosen. */
const DWELL_MS = 2600;
/** Seconds to cross-fade; `lying → standing` is the slow one on purpose. */
const FADE_PER_S = 1.6;

export interface PostureWeights {
  standing: number;
  sitting: number;
  lying: number;
  crouching: number;
}

/**
 * Picks the posture that fits. Pure — the hysteresis lives in the mixer.
 *
 * @param wantsToMove the wanderer is asking to walk; you cannot walk sitting
 */
export function choosePosture(
  state: FaceState,
  vars: PsycheVars,
  wantsToMove: boolean,
  current: Posture,
  /**
   * ADR-056: la posa che l'arredo lì accanto suggerisce, se ce n'è uno.
   *
   * **Suggerisce**, e la parola conta: entra dopo il sonno, l'attenzione e la
   * voglia di camminare, e prima soltanto dei ripieghi di energia e noia. Un
   * cuscino non deve poter tenere coricato uno a cui hanno appena parlato — che
   * è precisamente il modo in cui un arredo smetterebbe di essere un arredo e
   * diventerebbe una trappola.
   */
  hint: { beside?: Posture } = {},
): Posture {
  if (state === "sleeping") return vars.energia < 0.12 ? "lying" : "crouching";
  // being spoken to, or hearing something: he gets up and pays attention
  if (state === "listening" || state === "alert") return "standing";
  if (wantsToMove) return "standing";
  // talking from the floor reads as ignoring you: he sits up first
  if (state === "talking") return current === "lying" ? "sitting" : current;
  if (hint.beside !== undefined) return hint.beside;
  if (vars.energia < 0.2) return "lying";
  if (vars.energia < 0.45) return "sitting";
  // bored and unwilling to move: he sits rather than stands there
  if (vars.noia > 0.7 && vars.energia < 0.68) return "sitting";
  return "standing";
}

/** Holds the blend and the dwell timer. Not pure, deliberately. */
export class PostureMixer {
  private weights: PostureWeights = { standing: 1, sitting: 0, lying: 0, crouching: 0 };
  private target: Posture = "standing";
  private changedAt = 0;
  /** undefined, not 0: zero is a legitimate `performance.now()` reading, and
   *  using it as the "never ran" sentinel left the first step with dt = 0 for
   *  ever after. Found by the cross-fade test, not by review. */
  private lastNow: number | undefined;

  public get current(): Posture {
    return this.target;
  }

  /** True while a cross-fade is still running. */
  public get settling(): boolean {
    return this.weights[this.target] < 0.98;
  }

  public set(target: Posture, now: number): void {
    if (target === this.target) return;
    if (now - this.changedAt < DWELL_MS) return;
    this.target = target;
    this.changedAt = now;
  }

  public step(now: number): PostureWeights {
    const dt = this.lastNow === undefined ? 0 : Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;
    const k = clamp(dt * FADE_PER_S, 0, 1);
    for (const key of ["standing", "sitting", "lying", "crouching"] as const) {
      const goal = key === this.target ? 1 : 0;
      this.weights[key] += (goal - this.weights[key]) * k;
    }
    return { ...this.weights };
  }
}
