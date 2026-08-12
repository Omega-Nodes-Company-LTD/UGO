import { describe, expect, it } from "vitest";
import { ARCHETYPES, characterFrom } from "./character.js";
import { tidyAnswer } from "./councilService.js";

/**
 * The genome had existed since ADR-015 without piloting anything, which meant
 * two exemplars in the same house were two identical copies. These assert the
 * thing that makes a council worth convening: that they are actually
 * different.
 */

describe("characterFrom", () => {
  it("gives an empty genome a plain, unremarkable pig", () => {
    const plain = characterFrom({});
    expect(plain.persona).toContain("media");
    expect(plain.baselines.umore).toBeCloseTo(0.55, 2);
  });

  it("survives rubbish instead of throwing at it", () => {
    expect(() => characterFrom(undefined)).not.toThrow();
    expect(() => characterFrom({ curiosity: "molta" })).toThrow();
  });

  it("makes every archetype describe itself differently", () => {
    const personas = Object.values(ARCHETYPES).map((traits) => characterFrom(traits).persona);
    expect(new Set(personas).size).toBe(personas.length);
    for (const persona of personas) expect(persona.length).toBeGreaterThan(10);
  });

  it("moves the psyche baselines, not only the words", () => {
    const calm = characterFrom(ARCHETYPES.pigrone);
    const jumpy = characterFrom(ARCHETYPES.brontolone);
    // a placid pig starts less stressed than a grumpy one
    expect(calm.baselines.stress).toBeLessThan(jumpy.baselines.stress);
    const curious = characterFrom(ARCHETYPES.curiosone);
    expect(curious.baselines.curiosita).toBeGreaterThan(calm.baselines.curiosita);
    const fond = characterFrom(ARCHETYPES.affettuoso);
    expect(fond.baselines.affetto).toBeGreaterThan(jumpy.baselines.affetto);
  });

  it("lets a chatty one talk longer than a shy one", () => {
    expect(characterFrom(ARCHETYPES.curiosone).maxWords).toBeGreaterThan(
      characterFrom(ARCHETYPES.timidone).maxWords,
    );
  });

  it("keeps every baseline inside a liveable range, whatever the genome says", () => {
    for (const extreme of [0, 1]) {
      const character = characterFrom({
        curiosity: extreme,
        boldness: extreme,
        affection: extreme,
        calm: extreme,
        talkativeness: extreme,
      });
      for (const [name, value] of Object.entries(character.baselines)) {
        expect(value, name).toBeGreaterThan(0);
        expect(value, name).toBeLessThan(1);
      }
    }
  });

  it("carries the body dials through, so the genome shapes him too", () => {
    expect(characterFrom(ARCHETYPES.pigrone).traits.chonk).toBeGreaterThan(
      characterFrom({}).traits.chonk,
    );
  });
});

describe("tidyAnswer", () => {
  it("throws away the reasoning a local model leaves lying around", () => {
    expect(tidyAnswer("<think>uhm vediamo</think>Il fango è meglio.")).toBe("Il fango è meglio.");
  });

  it("strips the preamble punctuation and quotes", () => {
    expect(tidyAnswer('  «Secondo me no.»  ')).toBe("Secondo me no.");
    expect(tidyAnswer("1. Direi di sì")).toBe("Direi di sì");
  });

  it("treats an explicit NIENTE as having nothing to add", () => {
    expect(tidyAnswer("NIENTE")).toBeUndefined();
    expect(tidyAnswer("niente da aggiungere")).toBeUndefined();
  });

  it("gives back nothing rather than an empty answer", () => {
    expect(tidyAnswer(undefined)).toBeUndefined();
    expect(tidyAnswer("   ")).toBeUndefined();
    expect(tidyAnswer("<think>solo pensieri</think>")).toBeUndefined();
  });
});
