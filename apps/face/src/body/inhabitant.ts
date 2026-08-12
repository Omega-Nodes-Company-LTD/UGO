import type * as THREE from "three";
import type { FaceState } from "@ugo/shared/face";
import { Autonomy } from "./autonomy.js";
import { POSTURE_IT, type Posture } from "./channels.js";
import { GesturePlayer } from "./gestures.js";
import { DEFAULT_TRAITS, Pig, type Traits } from "./pig.js";
import { NEUTRAL_VARS, type PsycheVars, computePose } from "./pose.js";
import { PostureMixer, choosePosture } from "./posture.js";
import { ACTIVITY_IT, Wanderer } from "./wander.js";

/**
 * One creature in the room (ADR-036).
 *
 * Everything that used to sit on the renderer as "the" pig's state — mood,
 * gaze, blink timer, gesture player, wandering, posture — belongs here, once
 * per inhabitant. The renderer keeps only what the ROOM has: the scene, the
 * lights, the camera and the clock.
 *
 * Without this split a second gosino in the kitchen would have shared the
 * first one's blink and posture: two bodies moving as one, which is precisely
 * the failure ADR-032 spent a day removing from the soul.
 */

const GLANCE_EVERY_MS = 4200;
const GLANCE_SPREAD_MS = 3500;
const GLANCE_LASTS_MS = 700;

export class Inhabitant {
  public readonly pig: Pig;
  private readonly player = new GesturePlayer();
  private readonly autonomy: Autonomy;
  private readonly wanderer = new Wanderer();
  private readonly postures = new PostureMixer();

  private state: FaceState = "idle";
  private vars: PsycheVars = { ...NEUTRAL_VARS };
  private label = "";
  private gaze = { x: 0, y: 0 };
  private eased = { x: 0, y: 0 };
  private glance = { x: 0, y: 0 };
  private glanceUntil = 0;
  private nextGlanceAt = 0;
  private blinkUntil = 0;
  private nextBlinkAt = 0;
  private wandering: boolean;
  private forced: Posture | undefined;

  private activity = "fermo";
  private posture = "in piedi";
  /** where in the room he walks: his own slice of it, so nobody overlaps */
  private lane = 0;
  private here = { x: 0, z: 0 };

  public constructor(
    public readonly id: string,
    public readonly name: string,
    traits: Partial<Traits> | undefined,
    wander: boolean,
  ) {
    // merged, never replaced: a genome missing one dial would otherwise size
    // a limb from `undefined` and render a creature with no body — a shadow
    // on the floor and nothing standing on it, which is the worst way for a
    // body to fail because it looks like the socket died
    this.pig = new Pig({ ...DEFAULT_TRAITS, ...traits });
    this.autonomy = new Autonomy(this.player);
    this.wandering = wander;
    const now = performance.now();
    // staggered, or a room full of them would blink in unison like a chorus
    this.nextGlanceAt = now + GLANCE_EVERY_MS * Math.random();
    this.nextBlinkAt = now + 1500 + Math.random() * 3000;
  }

  public get object(): THREE.Object3D {
    return this.pig.object;
  }

  /** Where he is standing, for a camera that has to hold everybody. */
  public get position(): { x: number; z: number } {
    return this.here;
  }

  public get busy(): boolean {
    return (
      this.state === "talking" ||
      this.state === "listening" ||
      this.player.busy ||
      this.wanderer.moving ||
      this.postures.settling
    );
  }

  /** His slice of the floor: centre, and how far he may roam from it. */
  public setLane(centre: number, radiusX: number, radiusZ: number): void {
    this.lane = centre;
    this.wanderer.setPen(radiusX, radiusZ);
  }

  public setState(state: FaceState): void {
    if (state === this.state) return;
    // waking up is worth a gesture: he does not just pop his eyes open
    if (this.state === "sleeping" && state !== "sleeping") {
      this.autonomy.reflex("wake", performance.now());
    }
    this.state = state;
  }

  public setMood(label: string, vars: Partial<PsycheVars>): void {
    this.label = label;
    this.vars = { ...this.vars, ...vars };
  }

  public setGaze(target: { x: number; y: number }): void {
    this.gaze = target;
  }

  public setWandering(on: boolean): void {
    this.wandering = on;
  }

  public forcePosture(posture: Posture | undefined): void {
    this.forced = posture;
  }

  public reflex(kind: string): void {
    this.autonomy.reflex(kind, performance.now());
  }

  public dispose(): void {
    this.pig.dispose();
  }

  public debug(): Record<string, string> {
    return {
      state: this.state,
      posture: this.posture,
      activity: this.activity,
      mood: this.label,
      gesture: this.player.currentId ?? "",
      lastGesture: this.player.lastPlayed ?? "",
    };
  }

  /** One tick of this creature: the three layers, stacked. */
  public step(now: number): void {
    // the gaze arrives late, and now and then wanders off on its own: a pupil
    // welded to the target reads as a stare, not as attention
    if (now > this.glanceUntil && now > this.nextGlanceAt) {
      this.glanceUntil = now + GLANCE_LASTS_MS;
      this.nextGlanceAt = now + GLANCE_EVERY_MS + Math.random() * GLANCE_SPREAD_MS;
      this.glance = { x: (Math.random() - 0.5) * 1.4, y: (Math.random() - 0.5) * 0.8 };
    }
    const looking = now < this.glanceUntil ? this.glance : this.gaze;
    this.eased.x += (looking.x - this.eased.x) * 0.12;
    this.eased.y += (looking.y - this.eased.y) * 0.12;

    if (now > this.nextBlinkAt) {
      this.blinkUntil = now + 130;
      this.nextBlinkAt = now + 2500 + Math.random() * 3200;
    }

    const weights = this.postures.step(now);
    const loco = this.wanderer.step(
      now,
      this.state,
      this.vars.noia,
      this.vars.energia,
      weights.standing,
      this.wandering,
    );
    this.postures.set(
      this.forced ??
        choosePosture(this.state, this.vars, this.wanderer.wantsToMove, this.postures.current),
      now,
    );
    this.autonomy.tick(now, this.state, this.vars, this.postures.current);

    this.activity = ACTIVITY_IT[loco.activity];
    this.posture = POSTURE_IT[this.postures.current];
    this.here = { x: this.lane + loco.x, z: loco.z };
    this.pig.object.position.set(this.here.x, 0, this.here.z);
    this.pig.object.rotation.y = loco.heading;

    this.pig.apply(
      computePose({
        state: this.state,
        vars: this.vars,
        posture: weights,
        gaze: this.eased,
        tMs: now,
        blink: now < this.blinkUntil ? 1 : 0,
        locomotion: loco,
        gesture: this.player.sample(now),
      }),
    );
  }
}
