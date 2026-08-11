import type { FaceState } from "@ugo/shared/face";
import type { Locomotion } from "./pose.js";

/**
 * Wandering: UGO is not bolted to the middle of the screen.
 *
 * He walks, stops, puts his snout down and roots around. The urge comes out of
 * `noia` and `energia` — it is not a clip being replayed on a timer.
 *
 * Not pure: it owns a position, a heading and a little clock. That is exactly
 * why it is separate from `computePose`, which stays testable.
 */

export type Activity = "still" | "walking" | "rooting";

export const ACTIVITY_IT: Readonly<Record<Activity, string>> = {
  still: "fermo",
  walking: "cammina",
  rooting: "grufola",
};

export interface WanderOutput extends Locomotion {
  x: number;
  z: number;
  heading: number;
  activity: Activity;
}

/** The pen: past this he leaves the frame. */
const RADIUS_X = 1.5;
const RADIUS_Z = 0.9;
const SPEED = 0.85; // units/second at full stride
const TURN_RATE = 2.2; // rad/second

/**
 * States where wandering is allowed. Being spoken to (`listening`) or startled
 * (`alert`) means the attention is on you — he stops and turns back. Thinking
 * and talking do NOT stop him: pacing while you think is what animals do.
 */
const ROAMS_IN: readonly FaceState[] = ["idle", "thinking", "talking"];

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Wanderer {
  private x = 0;
  private z = 0;
  private heading = 0;
  private target = 0;
  private activity: Activity = "still";
  private until = 0;
  private walkAmount = 0;
  private rootAmount = 0;
  private phase = 0;
  /** undefined, not 0: zero is a legitimate `performance.now()` reading, and
   *  using it as the "never ran" sentinel left the first step with dt = 0 for
   *  ever after. Found by the cross-fade test, not by review. */
  private lastNow: number | undefined;
  private grounded = false;

  /** True while something is actually moving — portable mode respects it. */
  public get moving(): boolean {
    return this.walkAmount > 0.02 || this.rootAmount > 0.02;
  }

  /** True when he would like to be on his feet: the posture driver asks this. */
  public get wantsToMove(): boolean {
    return this.activity !== "still";
  }

  /**
   * @param standing how much of him is actually upright, from the posture mix;
   *                 sitting or lying he cannot walk, and the gait fades out
   */
  public step(
    now: number,
    state: FaceState,
    noia: number,
    energia: number,
    standing: number,
    enabled: boolean,
  ): WanderOutput {
    const dt = this.lastNow === undefined ? 0 : Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;
    const allowed = enabled && ROAMS_IN.includes(state);

    if (!allowed) {
      // someone is talking to him: stop, and turn back to face them
      this.activity = "still";
      this.until = 0;
      this.walkAmount += (0 - this.walkAmount) * Math.min(dt * 5, 1);
      this.rootAmount += (0 - this.rootAmount) * Math.min(dt * 5, 1);
      this.heading += wrapAngle(0 - this.heading) * Math.min(dt * 2.5, 1);
      return this.output();
    }

    if (now > this.until) this.pickNext(now, noia, energia);

    const delta = wrapAngle(this.target - this.heading);
    this.heading = wrapAngle(
      this.heading + Math.min(Math.abs(delta), TURN_RATE * dt) * Math.sign(delta),
    );

    // he only steps off once he is roughly aligned, and only on his feet
    const aligned = Math.abs(delta) < 0.35 ? 1 : 0;
    const wants = this.activity === "walking" ? aligned * standing : 0;
    this.walkAmount += (wants - this.walkAmount) * Math.min(dt * 4, 1);
    this.rootAmount +=
      ((this.activity === "rooting" ? 1 : 0) - this.rootAmount) * Math.min(dt * 4, 1);

    const speed = SPEED * this.walkAmount * (0.6 + energia * 0.4);
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    this.phase += speed * 7 * dt;

    if ((this.x / RADIUS_X) ** 2 + (this.z / RADIUS_Z) ** 2 > 1) {
      this.target = Math.atan2(-this.x, -this.z);
      this.activity = "walking";
      this.until = now + 1400;
    }

    return this.output();
  }

  private pickNext(now: number, noia: number, energia: number): void {
    const restless = Math.min(noia * 0.7 + energia * 0.5, 1);
    const roll = Math.random();
    if (this.activity === "walking") {
      // having arrived somewhere, he almost always sniffs at it
      this.activity = roll < 0.7 ? "rooting" : "still";
      this.until = now + (this.activity === "rooting" ? 1600 + Math.random() * 2200 : 1500);
      return;
    }
    if (roll < restless * 0.75) {
      this.activity = "walking";
      this.target = wrapAngle(this.heading + (Math.random() - 0.5) * 2.4);
      this.until = now + 1200 + Math.random() * 2600;
      return;
    }
    this.activity = roll < restless * 0.9 ? "rooting" : "still";
    this.until = now + 1800 + Math.random() * 3000 * (1 - restless);
  }

  private output(): WanderOutput {
    this.grounded = true;
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      walk: this.walkAmount,
      phase: this.phase,
      root: this.rootAmount,
      activity: this.activity,
    };
  }

  /** True once `step` has run at least once — used by the e2e hooks. */
  public get started(): boolean {
    return this.grounded;
  }
}
