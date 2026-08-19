import { describe, expect, it } from "vitest";
import { expressGene, hiddenAllele } from "./genes.js";

/**
 * L'espressione dei geni, guardata dal lato che serve a chi alleva: non «che
 * numero esce», ma **cosa una creatura porta senza mostrarlo**. È la domanda
 * che il pannello non poteva rispondere prima di ADR-105, e la ragione per cui
 * da due genitori senza chiazze nasce ogni tanto un cucciolo a chiazze.
 */
describe("hiddenAllele (ADR-105): quello che porta e non mostra", () => {
  it("un recessivo coperto si vede nel genoma e non addosso", () => {
    // spots è recessivo: si esprime il minore, e il 0.9 viaggia nascosto
    expect(expressGene("spots", [0.9, 0.1])).toBeCloseTo(0.1, 10);
    expect(hiddenAllele("spots", [0.9, 0.1])).toBeCloseTo(0.9, 10);
  });

  it("un dominante copre il suo compagno più basso", () => {
    expect(expressGene("boldness", [0.9, 0.1])).toBeCloseTo(0.9, 10);
    expect(hiddenAllele("boldness", [0.9, 0.1])).toBeCloseTo(0.1, 10);
  });

  it("in un gene che si mescola non c'è niente di nascosto: contribuiscono entrambi", () => {
    expect(hiddenAllele("calm", [0.9, 0.1])).toBeUndefined();
  });

  it("due alleli quasi uguali non nascondono niente che valga la pena dire", () => {
    expect(hiddenAllele("spots", [0.55, 0.5])).toBeUndefined();
    // e appena sopra la soglia sì, o non servirebbe a niente
    expect(hiddenAllele("spots", [0.7, 0.5])).toBeCloseTo(0.7, 10);
  });

  it("un omozigote non porta niente: quello che ha, lo mostra", () => {
    expect(hiddenAllele("spots", [0.9, 0.9])).toBeUndefined();
    expect(hiddenAllele("boldness", [0.2, 0.2])).toBeUndefined();
  });
});
