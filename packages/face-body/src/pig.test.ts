import * as THREE from "three";
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

describe("il grigio dell'età", () => {
  const skinColor = (pig: Pig): { s: number; l: number } => {
    let found = { s: 0, l: 0 };
    pig.object.traverse((node) => {
      if (node.name === "spot") return;
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
        const hsl = { h: 0, s: 0, l: 0 };
        node.material.color.getHSL(hsl);
        // il corpo è la prima mesh grande: basta la prima trovata
        if (found.s === 0 && found.l === 0) found = { s: hsl.s, l: hsl.l };
      }
    });
    return found;
  };

  /**
   * ADR-109. Le setole non sono un ornamento: sono il primo gene aggiunto dopo
   * la correzione del lettore dei genomi, e vanno dove va il genoma.
   */
  const bristlesOf = (pig: Pig): number => {
    let count = 0;
    pig.object.traverse((node) => {
      if (node.name === "bristle") count += 1;
    });
    return count;
  };

  it("sotto la soglia il dorso è liscio: un maiale glabro è un fenotipo", () => {
    expect(bristlesOf(new Pig({ ...DEFAULT_TRAITS, bristle: 0 }))).toBe(0);
    expect(bristlesOf(new Pig({ ...DEFAULT_TRAITS, bristle: 0.25 }))).toBe(0);
  });

  it("più setole nel gene, più cresta sulla schiena", () => {
    const few = bristlesOf(new Pig({ ...DEFAULT_TRAITS, bristle: 0.55 }));
    const many = bristlesOf(new Pig({ ...DEFAULT_TRAITS, bristle: 0.98 }));
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  });

  it("stesso gene, stessa cresta: non cambia pelo a ogni ricarica", () => {
    const a = bristlesOf(new Pig({ ...DEFAULT_TRAITS, bristle: 0.8 }));
    const b = bristlesOf(new Pig({ ...DEFAULT_TRAITS, bristle: 0.8 }));
    expect(a).toBe(b);
  });

  it("un giovane non è grigio", () => {
    const young = skinColor(new Pig({ ...DEFAULT_TRAITS, greying: 0 }));
    expect(young.s).toBeGreaterThan(0.5);
  });

  it("l'anziano perde pigmento e schiarisce, ma resta lo stesso animale", () => {
    const young = skinColor(new Pig({ ...DEFAULT_TRAITS, greying: 0 }));
    const old = skinColor(new Pig({ ...DEFAULT_TRAITS, greying: 1 }));
    expect(old.s).toBeLessThan(young.s * 0.4);
    expect(old.l).toBeGreaterThan(young.l);
    // la tinta non cambia: un maiale grigio è un maiale rosa che ha vissuto
    const hslYoung = { h: 0, s: 0, l: 0 };
    const hslOld = { h: 0, s: 0, l: 0 };
    new THREE.Color().setHSL(DEFAULT_TRAITS.hue, 0.6, 0.77).getHSL(hslYoung);
    new THREE.Color().setHSL(DEFAULT_TRAITS.hue, 0.1, 0.9).getHSL(hslOld);
    expect(hslOld.h).toBeCloseTo(hslYoung.h, 5);
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
