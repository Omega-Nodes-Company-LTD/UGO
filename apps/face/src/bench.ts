import { POSTURE_IT, POSTURES } from "./body/channels.js";
import { GESTURES } from "./body/gestures.js";
import { Webgl3dFace } from "./body/renderer3d.js";
import { DEFAULT_TRAITS, type Traits } from "./body/pig.js";
import { NEUTRAL_VARS, type PsycheVars } from "./body/pose.js";
import type { FaceState } from "@ugo/shared/face";

/**
 * The bench (`/bench.html`) — a dev page, not part of the creature.
 *
 * It drives the SAME modules the kiosk runs, so what you see here is what the
 * dock does. That is the whole reason it lives inside the app instead of in a
 * spike folder: two copies of an expression mapping drift within a week.
 *
 * It is also the legibility check: set a psyche, hide the label, and see
 * whether you can name the mood. If you cannot, the mapping is wrong — which
 * is a thing you can only find by looking.
 */

function el(sel: string): HTMLElement {
  const node = document.querySelector(sel);
  if (!(node instanceof HTMLElement)) throw new Error(`missing ${sel}`);
  return node;
}

const canvasNode = el("#face");
if (!(canvasNode instanceof HTMLCanvasElement)) throw new Error("#face is not a canvas");
const canvas = canvasNode;
const vars: PsycheVars = { ...NEUTRAL_VARS };
let traits: Traits = { ...DEFAULT_TRAITS };
let face = new Webgl3dFace(canvas, { traits, wander: true });
face.start();

const readout = el("#readout");
setInterval(() => {
  const debug = face.debug();
  readout.textContent = Object.entries(debug)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("   ·   ");
}, 200);

// ── stato ────────────────────────────────────────────────────────────────
const states: FaceState[] = ["sleeping", "idle", "alert", "listening", "thinking", "talking"];
const stateRow = el("#states");
for (const state of states) {
  const button = document.createElement("button");
  button.textContent = state;
  button.addEventListener("click", () => {
    face.setState(state);
    for (const other of stateRow.children) {
      other.setAttribute("aria-pressed", String(other === button));
    }
  });
  stateRow.append(button);
}

// ── psiche ───────────────────────────────────────────────────────────────
const psycheBox = el("#psyche");
for (const key of Object.keys(vars) as (keyof PsycheVars)[]) {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("label");
  label.textContent = key;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.value = String(Math.round(vars[key] * 100));
  const out = document.createElement("span");
  out.textContent = vars[key].toFixed(2);
  input.addEventListener("input", () => {
    vars[key] = Number(input.value) / 100;
    out.textContent = vars[key].toFixed(2);
    face.setMood("banco", vars);
  });
  row.append(label, input, out);
  psycheBox.append(row);
}
face.setMood("banco", vars);

// ── genoma: cambia la FORMA, e rifà il corpo ─────────────────────────────
const genomeBox = el("#genome");
function rebuild(): void {
  face.stop();
  face = new Webgl3dFace(canvas, { traits, wander: true });
  face.setMood("banco", vars);
  face.start();
}
for (const key of Object.keys(traits) as (keyof Traits)[]) {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("label");
  label.textContent = key;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.value = String(Math.round(traits[key] * 100));
  input.addEventListener("input", () => {
    traits = { ...traits, [key]: Number(input.value) / 100 };
    rebuild();
  });
  row.append(label, input, document.createElement("span"));
  genomeBox.append(row);
}

// ── i gesti, tutti quanti, raggruppati come li sceglie l'autonomia ───────
const gestureBox = el("#gestures");
const byTag = new Map<string, typeof GESTURES>();
for (const spec of GESTURES) {
  const tag = spec.tags[0] ?? "calm";
  byTag.set(tag, [...(byTag.get(tag) ?? []), spec]);
}
for (const [tag, specs] of [...byTag].sort(([a], [b]) => a.localeCompare(b))) {
  const group = document.createElement("div");
  group.className = "group";
  const title = document.createElement("h3");
  title.textContent = `${tag} · ${String(specs.length)}`;
  group.append(title);
  for (const spec of specs) {
    const button = document.createElement("button");
    button.textContent = spec.it;
    button.title = `${spec.id} · ${String(spec.ms)}ms`;
    button.addEventListener("click", () => {
      face.reflex(spec.id);
    });
    group.append(button);
  }
  gestureBox.append(group);
}
el("#count").textContent = String(GESTURES.length);

// ── postura: forzabile, per vedere le combinazioni una a una ─────────────
const postureBox = el("#postures");
for (const posture of POSTURES) {
  const button = document.createElement("button");
  button.textContent = POSTURE_IT[posture];
  button.addEventListener("click", () => {
    face.forcePosture(posture);
    for (const other of postureBox.children) {
      other.setAttribute("aria-pressed", String(other === button));
    }
  });
  postureBox.append(button);
}
el("#auto").addEventListener("click", () => {
  face.forcePosture(undefined);
  for (const other of postureBox.children) other.setAttribute("aria-pressed", "false");
});

el("#wander").addEventListener("change", (event) => {
  face.setWandering((event.target as HTMLInputElement).checked);
});
