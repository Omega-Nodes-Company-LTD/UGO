import { describe, expect, it } from "vitest";
import { DEFAULT_TRAITS } from "./pig.js";
import { gruntShouldSound, gruntVoice } from "./gruntSound.js";

describe("gruntVoice: il timbro viene dal corpo", () => {
  it("un maiale grosso suona più basso di uno magro", () => {
    const grosso = gruntVoice({ ...DEFAULT_TRAITS, chonk: 1 });
    const magro = gruntVoice({ ...DEFAULT_TRAITS, chonk: 0 });
    expect(grosso.pitchHz).toBeLessThan(magro.pitchHz);
  });

  it("un grugno lungo suona più scuro", () => {
    const lungo = gruntVoice({ ...DEFAULT_TRAITS, snout: 1 });
    const corto = gruntVoice({ ...DEFAULT_TRAITS, snout: 0 });
    expect(lungo.timbreHz).toBeLessThan(corto.timbreHz);
  });

  /** Stesso genoma, stesso verso: se cambiasse a ogni giro non sarebbe un tratto. */
  it("è deterministico", () => {
    expect(gruntVoice(DEFAULT_TRAITS)).toEqual(gruntVoice(DEFAULT_TRAITS));
  });
});

describe("gruntShouldSound: le tre regole del silenzio", () => {
  const ok = { sensesOn: true, night: false, speaking: false };

  it("coi sensi accesi, di giorno, in silenzio: suona", () => {
    expect(gruntShouldSound(ok)).toBe(true);
  });

  it("a sensi spenti non suona: un interruttore solo, quello che c'è già", () => {
    expect(gruntShouldSound({ ...ok, sensesOn: false })).toBe(false);
  });

  it("di notte tace: un verso attraverso il buio è una sveglia", () => {
    expect(gruntShouldSound({ ...ok, night: true })).toBe(false);
  });

  /**
   * La regola che conta di più: il grugnito **non è la voce**. Un verso sopra
   * una frase non è espressività, è una frase che non si capisce.
   */
  it("mentre parla non grugnisce, mai", () => {
    expect(gruntShouldSound({ ...ok, speaking: true })).toBe(false);
  });
});
