import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REFLEX } from "./autonomy.js";
import { GESTURE_BY_ID } from "./gestures.js";

/**
 * Ogni id che il corpo chiede a sé stesso esiste davvero.
 *
 * `GesturePlayer.play` **ignora in silenzio** un id che non conosce, ed è la
 * scelta giusta — un muso vecchio e un'anima nuova devono restare compatibili
 * (ADR-027). Il prezzo è che un refuso nel corpo non fallisce mai: nessuna
 * eccezione, nessun log, solo un gesto che non avviene.
 *
 * È così che `renderer3d` ha chiamato `reflex("earPerk")` per tutto il tempo in
 * cui la stanza ha avuto più di un abitante. `earPerk` è l'id di un **atto**
 * dell'anima (`acts.ts`), il cui `payload` è il gesto vero, `perkUp`: chi
 * ascoltava non ha mai drizzato le orecchie, e niente lo diceva.
 *
 * Il test legge i sorgenti invece di una lista, perché una lista da tenere
 * aggiornata a mano avrebbe lo stesso difetto della cosa che sta provando.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) yield path;
  }
}

/** `reflex("qualcosa")` — solo i letterali: le variabili vengono da fuori. */
function literalReflexIds(): { id: string; where: string }[] {
  const found: { id: string; where: string }[] = [];
  for (const file of sources(src)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\breflex\(\s*"([^"]+)"/g)) {
      const id = match[1];
      if (id !== undefined) found.push({ id, where: file.slice(src.length + 1) });
    }
  }
  return found;
}

const resolves = (id: string): boolean =>
  GESTURE_BY_ID.has(REFLEX[id] ?? id);

describe("gli id dei gesti", () => {
  it("finds the reflex calls at all, so an empty scan cannot pass for green", () => {
    expect(literalReflexIds().length).toBeGreaterThanOrEqual(3);
  });

  it("only asks for gestures that exist", () => {
    for (const { id, where } of literalReflexIds()) {
      expect(resolves(id), `${where}: reflex("${id}") non esiste`).toBe(true);
    }
  });

  it("maps every event name in REFLEX onto a real gesture", () => {
    for (const [event, id] of Object.entries(REFLEX)) {
      expect(GESTURE_BY_ID.has(id), `REFLEX.${event} -> ${id}`).toBe(true);
    }
  });
});
