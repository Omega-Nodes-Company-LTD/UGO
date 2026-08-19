import { EVENT_PERTURBATIONS } from "@ugo/psyche";
import { describe, expect, it } from "vitest";
import { EXEMPLARS_JS } from "./script/exemplars.js";

/**
 * ADR-101: ogni causa della psiche ha una parola italiana.
 *
 * Sei tipi su ventuno arrivavano al pannello col loro id inglese — `reward`,
 * `used_prop`, `loud_noise_muffled` in mezzo a «rumore» e «solitudine» — e
 * chi legge il pannello non deve imparare il nostro vocabolario interno.
 *
 * La guardia sta qui e non nella lista: aggiungere un evento alla psiche è
 * un'ottima cosa, dimenticare la sua parola è il difetto — e si scopre solo
 * guardando il pannello nel momento sbagliato.
 */
describe("le cause della psiche, in italiano", () => {
  it("ne ha una per ogni evento che la psiche conosce", () => {
    // si legge SOLO il blocco delle cause: cercare in tutto il modulo
    // conterebbe per buone le chiavi di qualunque altra mappa, e un evento
    // dimenticato passerebbe perché una parola simile esiste altrove
    const block = /const CAUSE_LABEL = \{([\s\S]*?)\n\};/u.exec(EXEMPLARS_JS)?.[1] ?? "";
    expect(block, "il blocco CAUSE_LABEL è stato rinominato o spostato").not.toBe("");
    const labelled = new Set([...block.matchAll(/([a-z_]+):\s*"/gu)].map((match) => match[1]));
    const missing = Object.keys(EVENT_PERTURBATIONS).filter((event) => !labelled.has(event));
    expect(missing, "cause senza parola italiana nel pannello").toEqual([]);
  });
});
