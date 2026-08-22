/**
 * The body's channel set — the vocabulary every layer writes into.
 *
 * Three layers stack here, and the order matters:
 *  1. posture  (standing / sitting / lying / crouching) — blended, not switched
 *  2. pose     (continuous, from the six psyche variables of PROGETTO §5.3)
 *  3. gestures (events with a start and an end, additive on top)
 *
 * Posture is deliberately ORTHOGONAL to `FaceState`: UGO can think while lying
 * down, talk while sitting, and be bored on his feet. Conflating the two is
 * what forces an enumeration of states; keeping them apart is what lets the
 * combinations exist without being written out one by one.
 */

/** Every additive channel a gesture is allowed to touch. */
export const GESTURE_CHANNELS = [
  "headPitch",
  "headYaw",
  "headRoll",
  "earLift",
  "earTwitch",
  "eyeOpen",
  "pupilX",
  "pupilY",
  "mouthOpen",
  "snout",
  "tailWag",
  "tailCurl",
  "bounce",
  "shake",
  "lean",
  "sink",
] as const;

export type Channel = (typeof GESTURE_CHANNELS)[number];

/** Additive offsets. Absent channel = no contribution. */
export type Impulse = Partial<Record<Channel, number>>;

export const NO_IMPULSE: Impulse = {};

/** Postures are blended by weight, so a transition is a cross-fade. */
export const POSTURES = ["standing", "sitting", "lying", "crouching"] as const;
export type Posture = (typeof POSTURES)[number];

/** Italian labels — code stays English (CLAUDE.md §10). */
export const POSTURE_IT: Readonly<Record<Posture, string>> = {
  standing: "in piedi",
  sitting: "seduto",
  lying: "coricato",
  crouching: "accovacciato",
};

/** The full pose handed to the geometry. Every field is a number on purpose. */
export interface Pose {
  earLift: number; // -1 floppy .. 1 perky
  earTwitch: number;
  headPitch: number; // rad, + = looking up
  headYaw: number;
  headRoll: number;
  eyeOpen: number; // 0 shut .. 1.3 wide
  pupilX: number;
  pupilY: number;
  snoutQuiver: number;
  mouthOpen: number; // 0..1
  tailWag: number; // rad
  tailCurl: number; // 0..1
  breath: number; // -1..1
  slump: number; // 0..1
  bounce: number;
  blush: number; // 0..1
  shake: number; // -1..1
  lean: number; // rad, + = forward
  /** posture weights, blended; standing is whatever is left over */
  sit: number;
  lie: number;
  crouch: number;
  walk: number; // 0..1 gait amplitude
  walkPhase: number; // rad
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** smoothstep: the ease every shape below is built from */
export const smooth = (u: number): number => {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
};
