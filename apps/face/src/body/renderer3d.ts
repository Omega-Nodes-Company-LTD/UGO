import * as THREE from "three";
import type { FaceState } from "@ugo/shared/face";
import { Autonomy } from "./autonomy.js";
import { POSTURE_IT, type Posture } from "./channels.js";
import type { FaceRenderer } from "./faceRenderer.js";
import { GesturePlayer } from "./gestures.js";
import { DEFAULT_TRAITS, Pig, type Traits } from "./pig.js";
import { NEUTRAL_VARS, type PsycheVars, computePose } from "./pose.js";
import { PostureMixer, choosePosture } from "./posture.js";
import { ACTIVITY_IT, Wanderer } from "./wander.js";

/**
 * The WebGL body: scene, lights, and the loop that stacks the three layers.
 *
 * Everything expressive lives in the pure modules next door; this file only
 * owns the clock, the blink timer and the camera.
 */

const GLANCE_EVERY_MS = 4200;
const GLANCE_SPREAD_MS = 3500;
const GLANCE_LASTS_MS = 700;
const CAMERA_HOME = new THREE.Vector3(0.85, 2.15, 8.6);

export interface Webgl3dOptions {
  traits?: Traits;
  /** off in the dock if the owner prefers him planted; on by default */
  wander?: boolean;
}

export class Webgl3dFace implements FaceRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pig: Pig;
  private readonly player = new GesturePlayer();
  private readonly autonomy: Autonomy;
  private readonly wanderer = new Wanderer();
  private readonly postures = new PostureMixer();
  private readonly observer: ResizeObserver;

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
  private lowPower = false;
  private wandering: boolean;
  private raf = 0;
  private lastDrawAt = 0;
  private activity = "fermo";
  private posture = "in piedi";
  /** bench only: pins the posture so the combinations can be seen one by one */
  private forced: Posture | undefined;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    options: Webgl3dOptions = {},
  ) {
    this.wandering = options.wander ?? true;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.copy(CAMERA_HOME);
    this.camera.lookAt(0, 1.1, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff1f4, 0x2a1b20, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 5.5, 4.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);

    this.pig = new Pig(options.traits ?? DEFAULT_TRAITS);
    this.scene.add(this.pig.object);

    this.autonomy = new Autonomy(this.player);
    this.observer = new ResizeObserver(() => {
      this.resize();
    });
    this.observer.observe(canvas);
    this.resize();
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

  public setLowPower(on: boolean): void {
    this.lowPower = on;
  }

  public setWandering(on: boolean): void {
    this.wandering = on;
  }

  /** Pins the posture (bench); `undefined` hands it back to the driver. */
  public forcePosture(posture: Posture | undefined): void {
    this.forced = posture;
  }

  public reflex(kind: string): void {
    this.autonomy.reflex(kind, performance.now());
  }

  public start(): void {
    const now = performance.now();
    this.nextGlanceAt = now + GLANCE_EVERY_MS;
    this.nextBlinkAt = now + 2500;
    const loop = (t: number): void => {
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  public stop(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.pig.dispose();
    this.renderer.dispose();
  }

  public readonly debug = (): Record<string, string | number> => ({
    renderer: "3d",
    state: this.state,
    posture: this.posture,
    activity: this.activity,
    mood: this.label,
    gesture: this.player.currentId ?? "",
    lastGesture: this.player.lastPlayed ?? "",
  });

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(now: number): void {
    // Portable mode (§4.2): if nothing is actually moving, stop drawing. Not a
    // throttled game loop — no frame at all until something changes.
    const busy =
      this.state === "talking" ||
      this.state === "listening" ||
      this.player.busy ||
      this.wanderer.moving ||
      this.postures.settling;
    if (this.lowPower && !busy && now - this.lastDrawAt < 500) return;
    this.lastDrawAt = now;

    // the gaze arrives late, and now and then wanders off on its own: a pupil
    // welded to the target reads as a stare, not as attention
    if (now > this.nextGlanceAt) {
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
    this.pig.object.position.set(loco.x, 0, loco.z);
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

    // the camera follows just enough that he never leaves the frame
    this.camera.position.x += (CAMERA_HOME.x + loco.x * 0.42 - this.camera.position.x) * 0.05;
    this.camera.lookAt(loco.x * 0.55, 1.1, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
