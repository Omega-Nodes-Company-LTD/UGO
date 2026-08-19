import { describe, expect, it } from "vitest";
import { parsePostcard } from "./postcards.js";

/**
 * ADR-099: la forma è chiusa, e il confine sono i due punti. Una cartolina
 * spedita per sbaglio è peggio di un gesto non capito, quindi qui si prova
 * soprattutto cosa NON è il gesto.
 */

describe("parsePostcard — le frasi che sono il gesto", () => {
  it("«manda ai nonni: siamo stati al parco» è un messaggio", () => {
    expect(parsePostcard("manda ai nonni: siamo stati al parco")).toEqual({
      kind: "messaggio",
      recipient: "nonni",
      text: "siamo stati al parco",
    });
  });

  it("«manda un ricordo a nonno Sandro: …» è un ricordo", () => {
    expect(parsePostcard("manda un ricordo a nonno Sandro: il nipote va in bici!")).toEqual({
      kind: "ricordo",
      recipient: "nonno Sandro",
      text: "il nipote va in bici",
    });
  });

  it("regge maiuscole, spazi e punteggiatura in coda", () => {
    expect(parsePostcard("  Manda alla Zia:   un bacione grande...  ")).toEqual({
      kind: "messaggio",
      recipient: "Zia",
      text: "un bacione grande",
    });
  });
});

describe("parsePostcard — le frasi che NON lo sono", () => {
  it.each([
    // niente due punti: senza confine dichiarato non è un atto
    "manda tutto a quel paese",
    "manda ai nonni un bacio",
    // il verbo non apre la frase: è un racconto, non un comando
    "ho mandato una lettera ai nonni: erano felici",
    "poi manda ai nonni: ciao",
    // vuoti da una parte o dall'altra
    "manda a : ciao",
    "manda ai nonni:   ",
    // frasi qualunque
    "come stai?",
    "aggiungi il latte alla spesa",
  ])("«%s» prosegue verso la conversazione", (phrase) => {
    expect(parsePostcard(phrase)).toBeUndefined();
  });
});
