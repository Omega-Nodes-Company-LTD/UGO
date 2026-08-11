/**
 * Livello espressione — PURO: nessun import grafico, nessun I/O.
 *
 * Traduce (stato discreto + variabili psiche continue + sguardo) in una posa.
 * È la parte che oggi manca: il renderer 2D riceve `umore` e `stress` e disegna
 * solo `umore`. Qui ogni variabile della psiche (§5.3) arriva a un muscolo.
 *
 * Unit-testabile come `packages/psyche`: numeri dentro, numeri fuori.
 */

export type FaceState =
  | "sleeping"
  | "idle"
  | "alert"
  | "listening"
  | "thinking"
  | "talking";

/** Le sei variabili di PROGETTO §5.3, tutte in [0,1]. */
export interface PsycheVars {
  umore: number;
  energia: number;
  affetto: number;
  noia: number;
  stress: number;
  curiosita: number;
}

import type { GestureImpulse } from "./gesture.js";
import type { Locomotion } from "./wander.js";

export interface Gaze {
  x: number; // [-1,1] destra positiva
  y: number; // [-1,1] alto positivo
}

export interface PoseInput {
  state: FaceState;
  vars: PsycheVars;
  gaze: Gaze;
  /** millisecondi monotoni: le oscillazioni sono funzione del tempo, non di uno stato interno */
  tMs: number;
  /** 0 = occhi aperti, 1 = palpebra completamente chiusa (il driver gestisce il timer) */
  blink: number;
  /** passo e grufolare, dal `Wanderer` */
  locomotion: Locomotion;
  /** scostamento del gesto in corso, dal `GesturePlayer` */
  gesture: GestureImpulse;
}

/** I canali che la geometria sa applicare. Continui: da qui viene la combinatoria. */
export interface Pose {
  earLift: number; // -1 afflosciate .. 1 dritte
  earTwitch: number; // scatto istantaneo
  headPitch: number; // rad, + = guarda in alto
  headYaw: number; // rad
  headRoll: number; // rad, inclinazione da curiosità
  eyeOpen: number; // 0 chiuso .. 1.3 spalancato
  pupilX: number;
  pupilY: number;
  snoutQuiver: number; // px relativi
  mouthOpen: number; // 0..1
  tailWag: number; // rad
  tailCurl: number; // 0..1 quanto è arricciata
  breath: number; // -1..1, pilota lo scale del corpo
  slump: number; // 0..1 quanto è accasciato
  bounce: number; // offset verticale (gasato)
  blush: number; // 0..1 guance
  crouch: number; // 0..1 accovacciato: zampe raccolte, pancia a terra
  walk: number; // 0..1 ampiezza dell'andatura
  walkPhase: number; // rad, fase del passo
  shake: number; // -1..1 tremolio del corpo (solo dai gesti)
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Frequenza del respiro in Hz. Un porcetto sfinito respira piano; sotto stress
 * respira corto e veloce. I maiali non sudano (PROGETTO §5.3): lo stress termico
 * si vede prima nel fiato che altrove.
 */
function breathHz(vars: PsycheVars, sleeping: boolean): number {
  if (sleeping) return 0.18;
  return 0.3 + vars.energia * 0.35 + vars.stress * 0.8;
}

export function computePose(input: PoseInput): Pose {
  const { state, vars, gaze, tMs, blink, locomotion, gesture } = input;
  const t = tMs / 1000;
  const sleeping = state === "sleeping";
  const alert = state === "alert";

  // Accasciamento: poca energia = tutto scende.
  const slump = clamp(sleeping ? 1 : (1 - vars.energia) * 0.8, 0, 1);

  // Accovacciarsi è un'altra cosa dall'accasciarsi: le zampe si raccolgono e
  // la pancia arriva a terra. Dormendo sempre; da sfinito, un po'.
  const crouch = sleeping ? 1 : clamp((0.28 - vars.energia) * 2.4, 0, 1) * 0.45;

  // Orecchie: barometro dell'umore (§4.1), con la curiosità che le tira su
  // e la stanchezza che le lascia cadere.
  const earLift = clamp(
    (vars.umore - 0.5) * 1.8 + vars.curiosita * 0.35 + (alert ? 0.55 : 0) - slump * 0.9,
    -1,
    1,
  ) - locomotion.root * 0.5 + gesture.earLift;

  // Scatto: quando è all'erta o ascolta, l'orecchio si muove da solo.
  const twitchGate = alert || state === "listening" ? 1 : 0;
  const earTwitch =
    twitchGate * Math.max(0, Math.sin(t * 7.3)) * 0.25 +
    locomotion.root * Math.max(0, Math.sin(t * 9.1)) * 0.2 +
    gesture.earTwitch;

  // Testa: guarda in alto quando pensa, cade quando dorme, segue lo sguardo.
  let headPitch = -slump * 0.16;
  if (state === "thinking") headPitch += 0.2;
  if (sleeping) headPitch -= 0.34;
  // parlando la testa accompagna le sillabe: fermo sembra un altoparlante
  if (state === "talking") headPitch += Math.sin(t * 11) * 0.025;
  headPitch += gaze.y * 0.12;
  // grufolare: il muso va giù e la testa spazzola avanti e indietro
  headPitch -= locomotion.root * 0.52;
  headPitch += gesture.headPitch;

  const headYaw = gaze.x * 0.3 * (1 - locomotion.root) + locomotion.root * Math.sin(t * 7.5) * 0.16;

  // L'inclinazione della testa è la firma della curiosità: cresce quando
  // ascolta ed è incuriosito, sparisce quando dorme.
  const headRoll = sleeping
    ? 0
    : (state === "listening" ? 0.13 : 0.03) * (0.3 + vars.curiosita) * Math.sin(t * 0.7) * 2;
  const roll = headRoll + gesture.headRoll + locomotion.walk * Math.sin(t * 6.2) * 0.05;

  // Occhi: chiusi nel sonno, spalancati in allerta, socchiusi se è a terra.
  let eyeOpen = 1 - slump * 0.3;
  if (state === "thinking") eyeOpen = 0.82;
  if (alert) eyeOpen = 1.3;
  if (sleeping) eyeOpen = 0;
  eyeOpen = clamp((eyeOpen - locomotion.root * 0.35 + gesture.eyeOpen) * (1 - blink), 0, 1.3);

  // Pupille: seguono lo sguardo; chi pensa guarda in alto a sinistra, come tutti.
  const pupilX = state === "thinking" ? -0.55 : clamp(gaze.x, -1, 1);
  const pupilY = state === "thinking" ? 0.6 : clamp(gaze.y, -1, 1);

  const snoutQuiver =
    (state === "listening" ? Math.sin(t * 16) * 0.6 : 0) + locomotion.root * Math.sin(t * 19) * 0.9;
  const mouthOpen = clamp(
    (state === "talking" ? (Math.sin(t * 11) + 1) / 2 : 0) + gesture.mouthOpen,
    0,
    1,
  );

  // Coda: l'affetto la fa scodinzolare, l'umore la arriccia. Ferma nel sonno.
  const wagAmp = sleeping ? 0 : vars.affetto * 0.5 + Math.max(0, vars.umore - 0.5) * 0.6;
  const tailWag = Math.sin(t * (2.5 + vars.energia * 3)) * (wagAmp + locomotion.walk * 0.35);
  const tailCurl = clamp(0.35 + vars.umore * 0.65 - slump * 0.4, 0, 1);

  const breath = Math.sin(t * breathHz(vars, sleeping) * Math.PI * 2);

  // Gasato: umore alto ed energia alta = non sta fermo. La noia lo inchioda.
  const springy = clamp((vars.umore - 0.7) * 3, 0, 1) * clamp((vars.energia - 0.55) * 3, 0, 1);
  const bounce =
    springy * Math.abs(Math.sin(t * 4.2)) * (1 - vars.noia * 0.7) * (1 - crouch) + gesture.bounce;

  return {
    earLift,
    earTwitch,
    headPitch,
    headYaw,
    headRoll: roll,
    eyeOpen,
    pupilX,
    pupilY,
    snoutQuiver,
    mouthOpen,
    tailWag,
    tailCurl,
    breath,
    slump,
    bounce,
    blush: clamp(vars.stress, 0, 1),
    crouch,
    walk: locomotion.walk,
    walkPhase: locomotion.phase,
    shake: gesture.shake,
  };
}
