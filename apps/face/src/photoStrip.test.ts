import { describe, expect, it } from "vitest";
import { photoStripPlan } from "./photoStrip.js";

/**
 * ADR-109: la parte che decide. Il disegno è quattro `append` e non ha
 * bisogno di un DOM finto per essere creduto; questo invece sì, perché
 * decide cosa una persona vede.
 */

describe("photoStripPlan", () => {
  it("prepara la sorgente e un alt che c'è sempre", () => {
    const plan = photoStripPlan([
      { id: "a", caption: "il parco stamattina", image: "AAAA" },
      { id: "b", caption: "   ", image: "BBBB" },
    ]);
    expect(plan.open).toBe(true);
    expect(plan.entries[0]?.src).toBe("data:image/jpeg;base64,AAAA");
    expect(plan.entries[0]?.alt).toBe("il parco stamattina");
    // senza didascalia niente riga vuota, ma l'alt resta: un'immagine senza
    // alt è invisibile a chi non vede
    expect(plan.entries[1]?.caption).toBeUndefined();
    expect(plan.entries[1]?.alt).toBe("uno scatto");
  });

  it("un elenco vuoto non apre una cornice vuota", () => {
    expect(photoStripPlan([])).toEqual({ open: false, entries: [] });
  });
});
