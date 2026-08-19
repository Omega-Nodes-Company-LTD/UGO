import { describe, expect, it } from "vitest";
import { nudgeOf } from "./nudges.js";

/**
 * Le forme delle spinte (ADR-064), provate **come unit**.
 *
 * Stavano solo dentro `nudges.integration.test.ts`, che per girare vuole un
 * Postgres: quindi un errore di riconoscimento si scopriva in CI e non in
 * cinque secondi sulla macchina di chi scrive. Ed è successo davvero — «vai a
 * dormire» veniva letto come «vai nella stanza *dormire*», perché la forma
 * generale era provata prima di quella specifica.
 *
 * Il riconoscimento è puro: non ha bisogno di un database, e non deve
 * dipenderne per essere provato.
 */
describe("nudgeOf: le forme, senza database", () => {
  it("riconosce i quattro verbi", () => {
    expect(nudgeOf("vai in cucina")).toEqual({ verb: "go", room: "cucina" });
    expect(nudgeOf("chiama Silvio")).toEqual({ verb: "call", name: "Silvio" });
    expect(nudgeOf("vai a dormire")).toEqual({ verb: "sleep" });
    expect(nudgeOf("vieni qui")).toEqual({ verb: "come" });
  });

  /**
   * Il caso che è costato un giro di CI: «vai a dormire» combacia ANCHE con la
   * forma dello spostamento. Una regola generale messa davanti a una specifica
   * se la mangia sempre.
   */
  it("«vai a dormire» non è una stanza che si chiama «dormire»", () => {
    expect(nudgeOf("vai a dormire")).toEqual({ verb: "sleep" });
    expect(nudgeOf("va' a dormire")).toEqual({ verb: "sleep" });
    expect(nudgeOf("Ugo, vai a dormire!")).toEqual({ verb: "sleep" });
    // e la stanza vera resta una stanza
    expect(nudgeOf("vai in camera")).toEqual({ verb: "go", room: "camera" });
  });

  it("le frasi qualunque non sono spinte", () => {
    for (const text of [
      "vado in cucina a farmi un caffè",
      "chiamami quando arrivi",
      "ieri sono andato in studio",
      "stanotte ho dormito male",
      "svegliati",
    ]) {
      expect(nudgeOf(text), text).toBeUndefined();
    }
  });
});
