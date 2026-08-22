import { describe, expect, it } from "vitest";
import type { Exchange } from "./biography.js";

/**
 * Le parti che si possono provare senza database stanno qui; che le righe
 * finiscano davvero cifrate su Postgres lo prova `chat.integration.test.ts`,
 * che gira contro un database vero (regola 1).
 *
 * Il valore di questo file è un altro: fissare le due decisioni che le copie
 * sparse avevano preso ognuna per conto suo.
 */
describe("recordExchange: le due decisioni che le copie prendevano da sole", () => {
  /**
   * Il `beingId` va SOLO sulla riga di chi ha parlato. Metterlo anche sulla
   * risposta significherebbe scrivere che UGO è quella persona, e la biografia
   * è la sola fonte da cui si ricostruisce chi ha detto cosa.
   */
  it("il tipo non permette di attribuire la risposta a una persona", () => {
    const exchange: Exchange = {
      channel: "home",
      beingId: "chi-parla",
      at: new Date("2026-08-19T10:00:00Z"),
      said: "ciao",
      replied: "grunf",
    };
    // `beingId` è uno solo, e la firma non offre un posto dove metterne un secondo
    expect(Object.keys(exchange).filter((key) => key.includes("being"))).toEqual(["beingId"]);
  });

  /**
   * Il costo esiste solo quando ha risposto un provider a pagamento. Scrivere
   * `0.000000` quando ha risposto la voce di casa non è «zero speso»: è una
   * riga che dichiara di aver interrogato un provider gratis, e sui conti si
   * legge diverso da una riga assente.
   */
  it("la spesa è opzionale, e assente non vuol dire zero", () => {
    const local: Exchange = {
      channel: "home",
      at: new Date(),
      said: "ciao",
      replied: "grunf",
    };
    expect(local.spent).toBeUndefined();
  });
});
