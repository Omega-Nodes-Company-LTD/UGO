import { identityPrompt, rulesPrompt } from "@ugo/prompts";
import { describe, expect, it } from "vitest";
import { buildPackPrompt, selfLine, type PackPromptInput } from "./packPrompt.js";

/**
 * Chi crede di essere.
 *
 * Il difetto che questi test tengono chiuso non stava in una riga di codice ma
 * nell'*ordine dei blocchi* (§5.5): `identity.it.md` è `[CACHED]` e vale per
 * ogni creatura della casa, e ci stava dentro un nome proprio. Il secondo
 * esemplare riceveva «Sei UGO» e «Sei Silvio in studio» nello stesso prompt e
 * rispondeva, ragionevolmente, «sono Ugo ma mi chiamano anche Silvio, dipende
 * da dove sono».
 *
 * Non serve un modello per dimostrarlo: la contraddizione è nel testo, e nel
 * testo si asserisce. Il modello era l'unica parte che funzionava.
 */

const SILVIO: PackPromptInput = {
  self: { name: "Silvio", locationLabel: "studio", traitVersion: 2 },
  present: [],
  relations: [],
  speciesRules: [],
  corrections: [],
};

describe("selfLine", () => {
  it("names the exemplar, where he is and which genome he runs", () => {
    expect(selfLine(SILVIO.self)).toBe("Ti chiami Silvio (tratti v2), e adesso sei in studio.");
  });

  it("says only the name when there is no room and no genome", () => {
    expect(selfLine({ name: "ugo", locationLabel: null, traitVersion: null })).toBe(
      "Ti chiami ugo.",
    );
  });
});

describe("il prompt assemblato", () => {
  /** Ciò che `LlmClient.chat()` monta: due blocchi cached, poi il dinamico. */
  const assemble = (pack: string): string =>
    [identityPrompt(), rulesPrompt(), pack].join("\n\n");

  it("names the creature exactly once, and it is the right one", () => {
    const whole = assemble(buildPackPrompt(SILVIO));
    expect(whole).toContain("Ti chiami Silvio");
    // la parte condivisa non rivendica più nessun nome: se un giorno qualcuno
    // rimettesse «Sei UGO» nel blocco cached, questa riga diventa rossa prima
    // che il secondo esemplare cominci a chiamarsi con due nomi
    expect(whole.match(/\bugo\b/gi) ?? []).toHaveLength(0);
  });

  it("keeps the name out of the part that is paid for once and shared", () => {
    // il nome sta **dopo** i blocchi cached, o spaccherebbe la cache per
    // esemplare: due creature sotto lo stesso tetto pagherebbero due prefissi
    const identity = identityPrompt();
    const pack = buildPackPrompt(SILVIO);
    expect(identity).not.toContain("Silvio");
    expect(pack).toContain("Silvio");
  });

  it("still tells the pack, the rules and the corrections after the name", () => {
    const pack = buildPackPrompt({
      ...SILVIO,
      present: [
        { id: "b1", displayName: "Marco", species: "human", familiarity: 0.8, affinity: 0.5 },
      ],
      speciesRules: ["con un cane non alzare la voce"],
      corrections: [{ signal: "too_loud", aboutBeing: null }],
    });
    const nameAt = pack.indexOf("Ti chiami Silvio");
    expect(nameAt).toBe(0);
    expect(pack.indexOf("Marco")).toBeGreaterThan(nameAt);
    expect(pack).toContain("vi conoscete bene");
    expect(pack).toContain("parli troppo forte");
  });
});
