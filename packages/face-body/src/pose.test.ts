import { describe, expect, it } from "vitest";
import type { FaceState } from "@ugo/shared/face";
import { GESTURES, sampleGesture } from "./gestures.js";
import type { Pose } from "./channels.js";
import { NEUTRAL_VARS, type PsycheVars, computePose } from "./pose.js";
import type { PostureWeights } from "./posture.js";

/**
 * The continuous layer is pure, so it is testable by PROPERTY rather than by
 * example. That is the whole argument for not enumerating a hundred states:
 * ten properties cover the entire space, a hundred states would need a hundred
 * assertions nobody writes.
 */

const STANDING: PostureWeights = { standing: 1, sitting: 0, lying: 0, crouching: 0 };
const STILL = { walk: 0, phase: 0, root: 0 };

/** True when any channel moved enough to be seen. */
function differs(a: Pose, b: Pose): boolean {
  const other = b as unknown as Record<string, number>;
  return Object.entries(a).some(([channel, value]) => Math.abs(value - (other[channel] ?? value)) > 0.02);
}

function pose(overrides: Partial<PsycheVars> = {}, state: FaceState = "idle", tMs = 1000) {
  return computePose({
    state,
    vars: { ...NEUTRAL_VARS, ...overrides },
    posture: STANDING,
    gaze: { x: 0, y: 0 },
    tMs,
    blink: 0,
    locomotion: STILL,
    gesture: {},
  });
}

describe("computePose", () => {
  it("is deterministic: the same input gives the same frame", () => {
    expect(pose({ umore: 0.8 }, "idle", 4321)).toEqual(pose({ umore: 0.8 }, "idle", 4321));
  });

  it("raises the ears with umore and drops them without it", () => {
    const sad = pose({ umore: 0.1 }).earLift;
    const mid = pose({ umore: 0.55 }).earLift;
    const glad = pose({ umore: 0.95 }).earLift;
    expect(sad).toBeLessThan(mid);
    expect(mid).toBeLessThan(glad);
  });

  it("keeps every channel inside its declared range, whatever you throw at it", () => {
    const states: FaceState[] = ["sleeping", "idle", "alert", "listening", "thinking", "talking"];
    for (let i = 0; i < 400; i += 1) {
      const vars: PsycheVars = {
        umore: Math.random(),
        energia: Math.random(),
        affetto: Math.random(),
        noia: Math.random(),
        stress: Math.random(),
        curiosita: Math.random(),
      };
      const state = states[i % states.length] ?? "idle";
      const p = computePose({
        state,
        vars,
        posture: STANDING,
        gaze: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
        tMs: Math.random() * 1e6,
        blink: i % 7 === 0 ? 1 : 0,
        locomotion: { walk: Math.random(), phase: Math.random() * 10, root: Math.random() },
        gesture: {},
      });
      expect(p.eyeOpen).toBeGreaterThanOrEqual(0);
      expect(p.eyeOpen).toBeLessThanOrEqual(1.3);
      expect(p.mouthOpen).toBeGreaterThanOrEqual(0);
      expect(p.mouthOpen).toBeLessThanOrEqual(1);
      expect(p.tailCurl).toBeGreaterThanOrEqual(0);
      expect(p.tailCurl).toBeLessThanOrEqual(1);
      expect(p.blush).toBeGreaterThanOrEqual(0);
      expect(p.blush).toBeLessThanOrEqual(1);
      expect(Math.abs(p.pupilX)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.pupilY)).toBeLessThanOrEqual(1);
      for (const value of Object.values(p)) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("shuts the eyes when asleep and while blinking, and only then", () => {
    expect(pose({}, "sleeping").eyeOpen).toBe(0);
    const blinked = computePose({
      state: "idle",
      vars: NEUTRAL_VARS,
      posture: STANDING,
      gaze: { x: 0, y: 0 },
      tMs: 1000,
      blink: 1,
      locomotion: STILL,
      gesture: {},
    });
    expect(blinked.eyeOpen).toBe(0);
    expect(pose({}, "idle").eyeOpen).toBeGreaterThan(0.5);
  });

  /**
   * The regression that matters. In the first draft `noia` only *suppressed*
   * other channels, so a bored UGO and a serene one were pixel-identical when
   * standing still — a variable visible only by absence is not visible.
   * Every psyche variable must move at least one channel on its own.
   */
  it("gives every psyche variable a visible effect of its own", () => {
    const keys: (keyof PsycheVars)[] = [
      "umore",
      "energia",
      "affetto",
      "noia",
      "stress",
      "curiosita",
    ];
    for (const key of keys) {
      // sampled over time: some signatures are oscillations, not offsets
      const moved = [0, 1500, 3000, 5000].some((t) =>
        [0.98, 0.02].some((value) =>
          differs(pose({}, "idle", t), pose({ [key]: value }, "idle", t)),
        ),
      );
      expect(moved, `${key} moves nothing: it would be invisible`).toBe(true);
    }
  });

  it("ignores noise around the baseline, so he does not twitch at nothing", () => {
    const base = pose({});
    const nudged = pose({ umore: NEUTRAL_VARS.umore + 0.02 });
    expect(nudged.earLift).toBeCloseTo(base.earLift, 6);
  });

  it("lets posture and state cross: he can think lying down", () => {
    const thinkingDown = computePose({
      state: "thinking",
      vars: NEUTRAL_VARS,
      posture: { standing: 0, sitting: 0, lying: 1, crouching: 0 },
      gaze: { x: 0, y: 0 },
      tMs: 1000,
      blink: 0,
      locomotion: STILL,
      gesture: {},
    });
    expect(thinkingDown.lie).toBe(1);
    // thinking still tips the head up relative to the same posture at rest
    const idleDown = computePose({
      state: "idle",
      vars: NEUTRAL_VARS,
      posture: { standing: 0, sitting: 0, lying: 1, crouching: 0 },
      gaze: { x: 0, y: 0 },
      tMs: 1000,
      blink: 0,
      locomotion: STILL,
      gesture: {},
    });
    expect(thinkingDown.headPitch).toBeGreaterThan(idleDown.headPitch);
  });
});

describe("the gesture catalogue", () => {
  it("has at least fifty of them, with unique ids", () => {
    expect(GESTURES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GESTURES.map((g) => g.id)).size).toBe(GESTURES.length);
  });

  /**
   * Gestures are ADDITIVE on top of the pose, so one that does not return to
   * zero pops in a single frame when its clock runs out. This caught `doze`,
   * which used to ramp the eyes shut and then snap them open.
   */
  it("starts and ends at zero on every channel", () => {
    for (const spec of GESTURES) {
      for (const u of [0, 1]) {
        for (const [channel, value] of Object.entries(sampleGesture(spec, u))) {
          expect(Math.abs(value), `${spec.id}.${channel} at u=${String(u)}`).toBeLessThan(0.001);
        }
      }
    }
  });

  it("actually moves something in the middle", () => {
    for (const spec of GESTURES) {
      const peak = [0.2, 0.35, 0.5, 0.65, 0.8]
        .flatMap((u) => Object.values(sampleGesture(spec, u)))
        .reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      expect(peak, spec.id).toBeGreaterThan(0.02);
    }
  });

  it("only asks for postures that exist", () => {
    for (const spec of GESTURES) {
      for (const posture of spec.needs ?? []) {
        expect(["standing", "sitting", "lying", "crouching"]).toContain(posture);
      }
    }
  });
});
