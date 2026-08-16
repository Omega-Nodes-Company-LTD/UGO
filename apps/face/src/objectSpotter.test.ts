import { describe, expect, it } from "vitest";
import { ObjectMemory, SPOT_COOLDOWN_MS, SPOT_MIN_CONFIDENCE } from "./objectSpotter.js";

/**
 * Gli occhi per le cose: la parte che un test in Node può guardare — cosa
 * vale un annuncio. MediaPipe è browser e si prova col banco, come il volto.
 */

describe("ObjectMemory", () => {
  it("una mela sicura diventa un annuncio in italiano, in snake_case sul filo", () => {
    const memory = new ObjectMemory(() => 0);
    expect(memory.notice("apple", 0.9)).toEqual({ kind: "apple", label: "una mela" });
    const bear = new ObjectMemory(() => 0).notice("teddy bear", 0.8);
    expect(bear?.kind).toBe("teddy_bear");
  });

  it("un'ombra non è una cosa: sotto soglia niente annuncio", () => {
    const memory = new ObjectMemory(() => 0);
    expect(memory.notice("apple", SPOT_MIN_CONFIDENCE - 0.01)).toBeUndefined();
  });

  it("le persone e le categorie che non ci interessano si ignorano", () => {
    const memory = new ObjectMemory(() => 0);
    expect(memory.notice("person", 0.99)).toBeUndefined();
    expect(memory.notice("toaster", 0.99)).toBeUndefined();
  });

  it("stupirsi due volte della stessa tazza è un tic: dieci minuti di silenzio", () => {
    let now = 0;
    const memory = new ObjectMemory(() => now);
    expect(memory.notice("cup", 0.9)).toBeDefined();
    now += SPOT_COOLDOWN_MS - 1;
    expect(memory.notice("cup", 0.9)).toBeUndefined();
    now += 2;
    expect(memory.notice("cup", 0.9)).toBeDefined();
    // ma una cosa NUOVA si annuncia subito, il silenzio è per categoria
    expect(memory.notice("apple", 0.9)).toBeDefined();
  });
});
