import type { FaceState } from "@ugo/shared/face";
import { type Impulse, type Pose, clamp } from "./channels.js";
import type { PostureWeights } from "./posture.js";

/**
 * The continuous layer — PURE. No graphics import, no I/O, no clock of its own.
 *
 * Numbers in, numbers out: this is the piece that is testable the way
 * `packages/psyche` is testable, and it is where "a hundred states" actually
 * lives — not as a list, as a mapping.
 */

/** The six variables of PROGETTO §5.3, all in [0,1]. */
export interface PsycheVars {
  umore: number;
  energia: number;
  affetto: number;
  noia: number;
  stress: number;
  curiosita: number;
}

export const NEUTRAL_VARS: PsycheVars = {
  umore: 0.55,
  energia: 0.7,
  affetto: 0.5,
  noia: 0.4,
  stress: 0.3,
  curiosita: 0.5,
};

/** Baselines from PROGETTO §5.3 — deviation is measured from here, not from 0.5. */
const BASELINE: PsycheVars = {
  umore: 0.55,
  energia: 0.7,
  affetto: 0.5,
  noia: 0.4,
  stress: 0.3,
  curiosita: 0.5,
};

export interface Gaze {
  x: number; // [-1,1], right positive
  y: number; // [-1,1], up positive
}

export interface Locomotion {
  walk: number; // 0 still .. 1 full stride
  phase: number; // rad
  root: number; // 0..1 snout to the ground
}

export interface PoseInput {
  state: FaceState;
  vars: PsycheVars;
  posture: PostureWeights;
  gaze: Gaze;
  /** monotonic milliseconds */
  tMs: number;
  /** 0 open, 1 fully blinked (the driver owns the timer) */
  blink: number;
  locomotion: Locomotion;
  /** additive offsets from the gesture in flight */
  gesture: Impulse;
}

/**
 * Deviation from baseline, expanded.
 *
 * A linear mapping is why procedural characters look dead: the psyche sits
 * near its baseline almost always, so a linear read produces "sereno" forever.
 * A dead zone kills the noise, and the sub-linear exponent makes the first
 * small departure from baseline already visible.
 */
function deviation(value: number, baseline: number, gain = 1): number {
  const d = value - baseline;
  if (Math.abs(d) < 0.03) return 0;
  const span = d > 0 ? 1 - baseline : baseline;
  const norm = clamp(d / (span || 1), -1, 1);
  return Math.sign(norm) * Math.abs(norm) ** 0.62 * gain;
}

/** Breaths per second. Exhausted breathes slow; stressed breathes short and fast. */
function breathHz(vars: PsycheVars, asleep: number): number {
  const awake = 0.3 + vars.energia * 0.35 + vars.stress * 0.9;
  return awake * (1 - asleep) + 0.17 * asleep;
}

const g = (gesture: Impulse, key: keyof Impulse): number => gesture[key] ?? 0;

export function computePose(input: PoseInput): Pose {
  const { state, vars, posture, gaze, tMs, blink, locomotion, gesture } = input;
  const t = tMs / 1000;
  const sleeping = state === "sleeping";
  const alert = state === "alert";
  const down = posture.lying + posture.crouching;

  // ── firme esclusive: ogni variabile possiede almeno un canale che nessun
  // altra tocca, altrimenti due variabili si sommano sullo stesso muscolo,
  // si annullano, e la dimensionalità effettiva scende sotto sei.

  // energia → accasciamento e respiro
  const tired = clamp(-deviation(vars.energia, BASELINE.energia), 0, 1);
  const slump = clamp(sleeping ? 1 : tired * 0.85, 0, 1);

  // umore → orecchie
  const mood = deviation(vars.umore, BASELINE.umore);
  const earLift =
    clamp(mood * 1.25 + vars.curiosita * 0.25 + (alert ? 0.55 : 0) - slump * 0.9, -1, 1) -
    locomotion.root * 0.5 +
    g(gesture, "earLift");

  // stress → guance e un tremore fine che nient'altro produce
  const strain = clamp(deviation(vars.stress, BASELINE.stress), 0, 1);
  const tremor = strain ** 2 * Math.sin(t * 17) * 0.035;

  // noia → lo sguardo che si stacca da te e va per conto suo. Prima la noia
  // si vedeva solo per assenza (smorzava il saltello), e l'assenza non è
  // leggibile: annoiato e sereno, da fermi, erano identici.
  const bored = clamp(deviation(vars.noia, BASELINE.noia), 0, 1);
  const drift = bored * Math.sin(t * 0.23) * 0.75;
  const driftHead = bored * Math.sin(t * 0.19 + 1.1) * 0.16;

  // affetto → coda, e il corpo che si sporge verso di te
  const bond = clamp(deviation(vars.affetto, BASELINE.affetto), 0, 1);

  // curiosità → l'inclinazione della testa
  const wonder = clamp(deviation(vars.curiosita, BASELINE.curiosita), -1, 1);

  const twitchGate = alert || state === "listening" ? 1 : 0;
  const earTwitch =
    twitchGate * Math.max(0, Math.sin(t * 7.3)) * 0.25 +
    locomotion.root * Math.max(0, Math.sin(t * 9.1)) * 0.2 +
    g(gesture, "earTwitch");

  let headPitch = -slump * 0.16;
  if (state === "thinking") headPitch += 0.2;
  headPitch -= posture.lying * 0.3 + posture.crouching * 0.2;
  if (sleeping) headPitch -= 0.24;
  if (state === "talking") headPitch += Math.sin(t * 11) * 0.025;
  headPitch += gaze.y * 0.12 * (1 - down) - locomotion.root * 0.52 + g(gesture, "headPitch");

  const headYaw =
    gaze.x * 0.3 * (1 - locomotion.root) * (1 - bored * 0.6) +
    locomotion.root * Math.sin(t * 7.5) * 0.16 +
    driftHead +
    g(gesture, "headYaw");

  const headRoll =
    (sleeping ? 0 : (state === "listening" ? 0.14 : 0.05) * (0.4 + wonder) * Math.sin(t * 0.7) * 2) +
    locomotion.walk * Math.sin(t * 6.2) * 0.05 +
    g(gesture, "headRoll");

  let eyeOpen = 1 - slump * 0.3;
  if (state === "thinking") eyeOpen = 0.82;
  if (alert) eyeOpen = 1.3;
  if (sleeping) eyeOpen = 0;
  eyeOpen = clamp(
    (eyeOpen - locomotion.root * 0.35 - posture.lying * 0.15 + g(gesture, "eyeOpen")) *
      (1 - blink),
    0,
    1.3,
  );

  const thinkingAway = state === "thinking";
  const pupilX = clamp(
    (thinkingAway ? -0.55 : gaze.x) + drift + g(gesture, "pupilX"),
    -1,
    1,
  );
  const pupilY = clamp((thinkingAway ? 0.6 : gaze.y) + g(gesture, "pupilY"), -1, 1);

  const snoutQuiver =
    (state === "listening" ? Math.sin(t * 16) * 0.6 : 0) +
    locomotion.root * Math.sin(t * 19) * 0.9 +
    g(gesture, "snout");

  const mouthOpen = clamp(
    (state === "talking" ? (Math.sin(t * 11) + 1) / 2 : 0) + g(gesture, "mouthOpen"),
    0,
    1,
  );

  const wagAmp = sleeping ? 0 : bond * 0.75 + Math.max(0, mood) * 0.35;
  const tailWag =
    Math.sin(t * (2.5 + vars.energia * 3)) * (wagAmp + locomotion.walk * 0.35) +
    g(gesture, "tailWag");
  const tailCurl = clamp(
    0.35 + vars.umore * 0.65 - slump * 0.4 + g(gesture, "tailCurl"),
    0,
    1,
  );

  const breath = Math.sin(t * breathHz(vars, sleeping ? 1 : down * 0.5) * Math.PI * 2);

  // gasato: umore alto ED energia alta. La noia lo inchioda al pavimento.
  const springy = clamp((vars.umore - 0.7) * 3, 0, 1) * clamp((vars.energia - 0.55) * 3, 0, 1);
  const bounce =
    springy * Math.abs(Math.sin(t * 4.2)) * (1 - vars.noia * 0.7) * posture.standing +
    g(gesture, "bounce");

  // sporgersi verso chi c'è: canale dell'affetto, e dei gesti
  const lean = bond * 0.13 * posture.standing + g(gesture, "lean") - g(gesture, "sink") * 0.1;

  return {
    earLift,
    earTwitch,
    headPitch,
    headYaw,
    headRoll,
    eyeOpen,
    pupilX,
    pupilY,
    snoutQuiver,
    mouthOpen,
    tailWag,
    tailCurl,
    breath,
    slump: clamp(slump + g(gesture, "sink"), 0, 1.3),
    bounce,
    blush: clamp(strain, 0, 1),
    shake: tremor + g(gesture, "shake"),
    lean,
    sit: posture.sitting,
    lie: posture.lying,
    crouch: posture.crouching,
    walk: locomotion.walk,
    walkPhase: locomotion.phase,
  };
}
