import { describe, expect, it } from "vitest";
import { monthOf, parseMemoryAsk, tellMemories } from "./memoryAsk.js";

/**
 * «Cosa ti ricordi di marzo?» (ADR-086) — puro, per esempi.
 *
 * Il confine che questo parser deve tenere è fra **la sua memoria** e la mia
 * frase: «mi ricordo che a marzo pioveva» non è una domanda, è una cosa che
 * gli sto raccontando — e rispondere con un elenco di ricordi sarebbe
 * interrompere qualcuno che parla.
 */

describe("chiedere cosa ricorda", () => {
  it("un mese nominato, senza anno: è quello più recente", () => {
    expect(parseMemoryAsk("cosa ti ricordi di marzo?")).toEqual({ month: 3, year: undefined });
  });

  it("col suo anno, se lo dice", () => {
    expect(parseMemoryAsk("cosa ti ricordi di marzo 2026?")).toEqual({ month: 3, year: 2026 });
  });

  it("«che ricordi hai di dicembre» è la stessa domanda", () => {
    expect(parseMemoryAsk("che ricordi hai di dicembre?")).toMatchObject({ month: 12 });
  });

  it("«cosa ti ricordi dell'anno scorso» è un anno intero", () => {
    expect(parseMemoryAsk("cosa ti ricordi dell'anno scorso?")).toEqual({
      month: undefined,
      year: -1,
    });
  });

  it("senza un tempo non si risponde con la memoria: fallisce chiuso", () => {
    // «cosa ti ricordi?» è troppo per essere una domanda: sono tutti i suoi
    // ricordi, e un elenco di tutto non è un ricordo
    expect(parseMemoryAsk("cosa ti ricordi?")).toBeUndefined();
  });

  it("non ruba la frase di chi sta raccontando", () => {
    expect(parseMemoryAsk("mi ricordo che a marzo pioveva")).toBeUndefined();
    expect(parseMemoryAsk("ti ricordi di comprare il latte")).toBeUndefined();
  });

  it("non ruba il diario: quello è una giornata, questo è un mese", () => {
    expect(parseMemoryAsk("cos'hai fatto ieri?")).toBeUndefined();
  });
});

describe("il mese che indica", () => {
  it("un mese già passato quest'anno è di quest'anno", () => {
    expect(monthOf({ month: 3, year: undefined }, "2026-08-18")).toBe("2026-03");
  });

  it("un mese non ancora arrivato è quello dell'anno scorso", () => {
    // ad agosto, «dicembre» è il dicembre che c'è stato, non quello che verrà
    expect(monthOf({ month: 12, year: undefined }, "2026-08-18")).toBe("2025-12");
  });

  it("il mese corrente è questo", () => {
    expect(monthOf({ month: 8, year: undefined }, "2026-08-18")).toBe("2026-08");
  });

  it("l'anno scorso non è un mese", () => {
    expect(monthOf({ month: undefined, year: -1 }, "2026-08-18")).toBe("2025");
  });
});

describe("come lo racconta", () => {
  it("niente da quel mese si dice, e non si tace", () => {
    expect(tellMemories([], "2026-03")).toContain("marzo 2026");
    expect(tellMemories([], "2026-03")).toContain("non mi viene in mente");
  });

  it("i ricordi sono i suoi, parola per parola", () => {
    const said = tellMemories(
      [
        { text: "Il corriere passa il martedì", kind: "fact" },
        { text: "Gli piace il caffè lungo", kind: "preference" },
      ],
      "2026-03",
    );
    expect(said).toContain("marzo 2026");
    expect(said).toContain("Il corriere passa il martedì");
    expect(said).toContain("Gli piace il caffè lungo");
  });

  it("un anno intero si dice come un anno", () => {
    expect(tellMemories([{ text: "una cosa", kind: "fact" }], "2025")).toContain("2025");
  });
});
