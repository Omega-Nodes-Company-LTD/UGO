import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GESTURE_BY_ID, REFLEX } from "@ugo/face-body";
import { describe, expect, it } from "vitest";

/**
 * Il gemello del test che sta in `@ugo/face-body`, per i sorgenti del chiosco.
 *
 * `GesturePlayer.play` ignora in silenzio un id che non conosce — è la scelta
 * giusta (ADR-027: muso vecchio e anima nuova devono restare compatibili) e il
 * prezzo è che un refuso non fallisce mai: nessuna eccezione, nessun log, solo
 * un gesto che non avviene.
 *
 * Quando il corpo è stato estratto in un package (gruppo 15), lo scanner di là
 * ha smesso di vedere `main.ts`: la copertura si sarebbe persa in silenzio, se
 * quel test non avesse avuto una guardia sul **numero** di chiamate trovate.
 * Da qui questo file: ogni albero si sorveglia da sé.
 */

const here = dirname(fileURLToPath(import.meta.url));

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) yield path;
  }
}

function literalGestureIds(): { id: string; where: string }[] {
  const found: { id: string; where: string }[] = [];
  for (const file of sources(here)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\b(?:reflex|playGesture)\(\s*"([^"]+)"/g)) {
      const id = match[1];
      if (id !== undefined) found.push({ id, where: file.slice(here.length + 1) });
    }
  }
  return found;
}

describe("gli id dei gesti chiesti dal chiosco", () => {
  it("ogni id chiesto per nome esiste davvero", () => {
    // `reflex("noise")` è il nome di uno STIMOLO, non di un gesto: la mappa
    // dice quale gesto ne segue, ed è lo stesso passaggio che fa il corpo
    const unknown = literalGestureIds().filter(
      (call) => !GESTURE_BY_ID.has(REFLEX[call.id] ?? call.id),
    );
    expect(
      unknown.map((call) => `${call.where}: ${call.id}`),
      "un gesto che non esiste non fallisce a runtime: semplicemente non avviene",
    ).toEqual([]);
  });
});
