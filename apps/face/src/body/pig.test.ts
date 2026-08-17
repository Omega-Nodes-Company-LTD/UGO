import { describe, expect, it } from "vitest";
import { DEFAULT_TRAITS, Pig } from "./pig.js";

/**
 * Il manto e la coda vengono dal genoma (ADR-068/069). THREE gira anche senza
 * DOM, quindi la geometria si può interrogare da unit test: quello che si
 * prova è che i due geni nuovi arrivino DAVVERO al corpo — `trait_sets` è già
 * rimasto una volta per mesi a pilotare niente (ADR-031), e non deve
 * succedere di nuovo.
 */

const spotsOf = (pig: Pig): number => {
  let count = 0;
  pig.object.traverse((node) => {
    if (node.name === "spot") count += 1;
  });
  return count;
};

describe("il manto a chiazze", () => {
  it("un fondatore qualunque non ha chiazze: il default resta il corpo di prima", () => {
    expect(spotsOf(new Pig())).toBe(0);
  });

  it("un portatore (espressione sotto soglia) non mostra niente", () => {
    expect(spotsOf(new Pig({ ...DEFAULT_TRAITS, spots: 0.4 }))).toBe(0);
  });

  it("l'omozigote chiazzato mostra il manto, e più spots = più chiazze", () => {
    const few = spotsOf(new Pig({ ...DEFAULT_TRAITS, spots: 0.6 }));
    const many = spotsOf(new Pig({ ...DEFAULT_TRAITS, spots: 0.95 }));
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  });

  it("stesso genoma, stesso manto: il pattern è della creatura, non del frame", () => {
    const a = new Pig({ ...DEFAULT_TRAITS, spots: 0.8 });
    const b = new Pig({ ...DEFAULT_TRAITS, spots: 0.8 });
    expect(spotsOf(a)).toBe(spotsOf(b));
  });
});

describe("la coda", () => {
  const tailScale = (pig: Pig): number => {
    let scale = 1;
    pig.object.traverse((node) => {
      // il ricciolo è l'unico gruppo scalato uniformemente sotto il corpo
      if (node.scale.x !== 1 && node.scale.x === node.scale.y && node.scale.y === node.scale.z) {
        scale = node.scale.x;
      }
    });
    return scale;
  };

  it("il gene tail scala il ricciolo: coda lunga si nasce", () => {
    const short = tailScale(new Pig({ ...DEFAULT_TRAITS, tail: 0 }));
    const long = tailScale(new Pig({ ...DEFAULT_TRAITS, tail: 1 }));
    expect(short).toBeLessThan(1);
    expect(long).toBeGreaterThan(1.3);
  });
});
