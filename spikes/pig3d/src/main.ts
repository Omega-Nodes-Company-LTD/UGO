import * as THREE from "three";
import { Pig, DEFAULT_TRAITS, type Traits } from "./pig.js";
import { computePose, type FaceState, type PsycheVars } from "./pose.js";
import { GesturePlayer, type GestureKind } from "./gesture.js";
import { Wanderer } from "./wander.js";

/**
 * Spike: il porcetto procedurale in un browser, con i sei stati di §4.1 e le
 * sei variabili di psiche di §5.3 pilotabili a mano. Serve a decidere, non a
 * essere spedito: la struttura (pose.ts puro + pig.ts geometria) è però già
 * quella che andrebbe in `apps/face`.
 */

const GLANCE_EVERY_MS = 4200;
const GLANCE_SPREAD_MS = 3500;
const GLANCE_LASTS_MS = 700;

const el = <T extends HTMLElement>(sel: string): T => {
  const node = document.querySelector(sel);
  if (node === null) throw new Error(`manca ${sel}`);
  return node as T;
};

const stage = el<HTMLDivElement>("#stage");
const fpsOut = el<HTMLSpanElement>("#fps");
const moodOut = el<HTMLSpanElement>("#mood");
const activityOut = el<HTMLSpanElement>("#activity");

// ── scena ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const CAM = new THREE.Vector3(0.85, 2.15, 8.6);
camera.position.copy(CAM);
camera.lookAt(0, 1.1, 0);

scene.add(new THREE.HemisphereLight(0xfff1f4, 0x2a1b20, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(3, 5.5, 4.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
rim.position.set(-4, 2, -3);
scene.add(rim);

let pig = new Pig(DEFAULT_TRAITS);
scene.add(pig.object);

function resize(): void {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ── stato pilotato dalla UI (in produzione arriva da soul via WS) ──────
let state: FaceState = "idle";
const vars: PsycheVars = {
  umore: 0.62,
  energia: 0.7,
  affetto: 0.55,
  noia: 0.3,
  stress: 0.25,
  curiosita: 0.5,
};
let traits: Traits = { ...DEFAULT_TRAITS };

const gazeTarget = { x: 0, y: 0 };
const gazeEased = { x: 0, y: 0 };
let followPointer = true;

let glanceUntil = 0;
let nextGlanceAt = performance.now() + GLANCE_EVERY_MS;
const glance = { x: 0, y: 0 };
let blinkUntil = 0;
let nextBlinkAt = performance.now() + 2500;

const wanderer = new Wanderer();
const gestures = new GesturePlayer();
let wandering = true;
let lowPower = false;
let lastDrawAt = 0;
let frames = 0;
let fpsSince = performance.now();

window.addEventListener("pointermove", (event) => {
  if (!followPointer) return;
  const rect = stage.getBoundingClientRect();
  gazeTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  gazeTarget.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
});

function tick(now: number): void {
  requestAnimationFrame(tick);

  // Modalità portable (§4.2): fuori dagli stati che animano davvero, ~2 fps.
  // Non è un throttle del game loop: è proprio non disegnare.
  const busy = state === "talking" || state === "listening" || wanderer.moving;
  if (lowPower && !busy && now - lastDrawAt < 500) {
    return;
  }
  lastDrawAt = now;

  // lo sguardo arriva in ritardo, e ogni tanto se ne va per conto suo:
  // una pupilla saldata al puntatore legge come fissità, non come attenzione
  if (now > nextGlanceAt) {
    glanceUntil = now + GLANCE_LASTS_MS;
    nextGlanceAt = now + GLANCE_EVERY_MS + Math.random() * GLANCE_SPREAD_MS;
    glance.x = (Math.random() - 0.5) * 1.4;
    glance.y = (Math.random() - 0.5) * 0.8;
  }
  const looking = now < glanceUntil ? glance : gazeTarget;
  gazeEased.x += (looking.x - gazeEased.x) * 0.12;
  gazeEased.y += (looking.y - gazeEased.y) * 0.12;

  if (now > nextBlinkAt) {
    blinkUntil = now + 130;
    nextBlinkAt = now + 2500 + Math.random() * 3200;
  }
  const blink = now < blinkUntil ? 1 : 0;

  // il vagabondaggio gira solo in idle: se gli parli, si ferma e si rigira
  const loco = wanderer.step(now, wandering && state === "idle", vars.noia, vars.energia);
  pig.object.position.set(loco.x, 0, loco.z);
  pig.object.rotation.y = loco.heading;
  activityOut.textContent = wandering ? loco.activity : "fermo";

  pig.apply(
    computePose({
      state,
      vars,
      gaze: gazeEased,
      tMs: now,
      blink,
      locomotion: loco,
      gesture: gestures.sample(now),
    }),
  );

  // la camera lo accompagna appena, così non esce mai dall'inquadratura
  camera.position.x += (CAM.x + loco.x * 0.42 - camera.position.x) * 0.05;
  camera.lookAt(loco.x * 0.55, 1.1, 0);
  renderer.render(scene, camera);

  frames += 1;
  if (now - fpsSince > 500) {
    fpsOut.textContent = String(Math.round((frames * 1000) / (now - fpsSince)));
    frames = 0;
    fpsSince = now;
  }
}
requestAnimationFrame(tick);

// ── etichetta d'umore: le stesse soglie che userebbe packages/psyche ────
function moodLabel(v: PsycheVars): string {
  if (v.stress > 0.7) return "in ansia da caldo";
  if (v.energia < 0.25) return "mogio";
  if (v.umore > 0.78 && v.energia > 0.6) return "gasato";
  if (v.umore < 0.35) return "giù di corda";
  if (v.noia > 0.7) return "annoiato";
  if (v.curiosita > 0.75) return "incuriosito";
  return "sereno";
}

// ── UI ─────────────────────────────────────────────────────────────────
const stateButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-state]"),
);
function setState(next: FaceState): void {
  state = next;
  for (const button of stateButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.state === next));
  }
}
for (const button of stateButtons) {
  button.addEventListener("click", () => {
    stopStory();
    setState(button.dataset.state as FaceState);
  });
}
setState("idle");

function bindSlider(id: keyof PsycheVars): void {
  const input = el<HTMLInputElement>(`#${id}`);
  const out = el<HTMLSpanElement>(`#${id}-out`);
  const sync = (): void => {
    vars[id] = Number(input.value) / 100;
    out.textContent = vars[id].toFixed(2);
    moodOut.textContent = moodLabel(vars);
  };
  input.value = String(Math.round(vars[id] * 100));
  input.addEventListener("input", () => {
    stopStory();
    sync();
  });
  sync();
}
(["umore", "energia", "affetto", "noia", "stress", "curiosita"] as const).forEach(bindSlider);

function rebuild(): void {
  scene.remove(pig.object);
  pig.dispose();
  pig = new Pig(traits);
  scene.add(pig.object);
}

function bindTrait(id: keyof Traits): void {
  const input = el<HTMLInputElement>(`#${id}`);
  input.value = String(Math.round(traits[id] * 100));
  input.addEventListener("input", () => {
    traits = { ...traits, [id]: Number(input.value) / 100 };
    rebuild();
  });
}
(["chonk", "ear", "snout", "eye", "leg", "hue"] as const).forEach(bindTrait);

el<HTMLInputElement>("#wander").addEventListener("change", (event) => {
  wandering = (event.target as HTMLInputElement).checked;
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-gesture]")) {
  button.addEventListener("click", () => {
    gestures.play(button.dataset.gesture as GestureKind, performance.now());
  });
}
el<HTMLInputElement>("#lowpower").addEventListener("change", (event) => {
  lowPower = (event.target as HTMLInputElement).checked;
});
el<HTMLInputElement>("#gaze").addEventListener("change", (event) => {
  followPointer = (event.target as HTMLInputElement).checked;
  if (!followPointer) {
    gazeTarget.x = 0;
    gazeTarget.y = 0;
  }
});

el<HTMLButtonElement>("#random").addEventListener("click", () => {
  traits = {
    chonk: Math.random(),
    ear: Math.random(),
    snout: Math.random(),
    eye: 0.25 + Math.random() * 0.75,
    leg: Math.random(),
    hue: Math.random(),
  };
  for (const id of ["chonk", "ear", "snout", "eye", "leg", "hue"] as const) {
    el<HTMLInputElement>(`#${id}`).value = String(Math.round(traits[id] * 100));
  }
  rebuild();
});

// ── "una mattina": la sequenza che il corpo di casa fa davvero ──────────
interface Beat {
  ms: number;
  state?: FaceState;
  vars?: Partial<PsycheVars>;
  caption: string;
}
const STORY: Beat[] = [
  { ms: 0, state: "sleeping", vars: { energia: 0.15, umore: 0.5, curiosita: 0.3, stress: 0.15 }, caption: "02:40 — dorme: il buio dopo le 22 lo ha addormentato" },
  { ms: 3800, state: "alert", vars: { energia: 0.45, curiosita: 0.8 }, caption: "07:15 — ti vede entrare: orecchie su, occhi spalancati" },
  { ms: 6200, state: "idle", vars: { energia: 0.62, umore: 0.7, affetto: 0.75 }, caption: "ti riconosce — l'affetto fa partire la coda" },
  { ms: 8600, state: "listening", vars: { curiosita: 0.85 }, caption: "«Ehi UGO» — ascolta: il grugno freme, la testa si inclina" },
  { ms: 11800, state: "thinking", caption: "pensa — guarda in alto, come tutti" },
  { ms: 13600, state: "talking", vars: { umore: 0.82 }, caption: "«…e com'è andata la consegna DHL?» — il desire di stanotte" },
  { ms: 17200, state: "idle", vars: { umore: 0.88, energia: 0.8 }, caption: "gasato: umore e energia alti, non sta fermo" },
  { ms: 20500, state: "idle", vars: { stress: 0.85, umore: 0.5 }, caption: "29 °C in stanza — i maiali non sudano: stress, guance, fiato corto" },
  { ms: 24000, state: "idle", vars: { stress: 0.2, energia: 0.12, umore: 0.35, affetto: 0.5, noia: 0.6, curiosita: 0.35 }, caption: "sera: energia a terra, orecchie afflosciate, tutto si accascia" },
  { ms: 27500, state: "sleeping", caption: "…e si riaddormenta" },
];

let storyTimers: ReturnType<typeof setTimeout>[] = [];
const caption = el<HTMLParagraphElement>("#caption");

function stopStory(): void {
  for (const timer of storyTimers) clearTimeout(timer);
  storyTimers = [];
  caption.textContent = "";
}

el<HTMLButtonElement>("#play").addEventListener("click", () => {
  stopStory();
  for (const beat of STORY) {
    storyTimers.push(
      setTimeout(() => {
        if (beat.state !== undefined) setState(beat.state);
        if (beat.vars !== undefined) {
          Object.assign(vars, beat.vars);
          for (const id of ["umore", "energia", "affetto", "noia", "stress", "curiosita"] as const) {
            el<HTMLInputElement>(`#${id}`).value = String(Math.round(vars[id] * 100));
            el<HTMLSpanElement>(`#${id}-out`).textContent = vars[id].toFixed(2);
          }
          moodOut.textContent = moodLabel(vars);
        }
        caption.textContent = beat.caption;
      }, beat.ms),
    );
  }
});
