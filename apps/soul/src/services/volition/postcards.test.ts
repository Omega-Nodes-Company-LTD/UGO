import { describe, expect, it } from "vitest";
import { parsePhotoPostcard, parsePostcard } from "./postcards.js";

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

/**
 * ADR-109 × ADR-099: «scattaci una foto e mandala al gosino di nonno Sandro».
 *
 * Un gesto solo, che ne contiene due — e per questo la forma è più stretta,
 * non più larga: qui una frase mal capita non manda solo parole sbagliate a
 * casa d'altri, fa anche scattare una foto che nessuno voleva.
 */
describe("parsePhotoPostcard — la cartolina con la foto", () => {
  it("«scattaci una foto e mandala al gosino di nonno Sandro»: la domanda originale", () => {
    expect(parsePhotoPostcard("scattaci una foto e mandala al gosino di nonno Sandro")).toEqual({
      kind: "foto",
      recipient: "gosino di nonno Sandro",
      text: "",
    });
  });

  it("«scatta una foto e mandala ai nonni»", () => {
    expect(parsePhotoPostcard("Scatta una foto e mandala ai nonni!")).toEqual({
      kind: "foto",
      recipient: "nonni",
      text: "",
    });
  });

  it("con i due punti porta anche le parole da scrivere dietro", () => {
    expect(parsePhotoPostcard("manda una foto ai nonni: siamo al parco")).toEqual({
      kind: "foto",
      recipient: "nonni",
      text: "siamo al parco",
    });
  });

  it.each([
    // «scatta una foto» e basta è l'altro gesto: qui non deve entrare, o
    // ogni scatto partirebbe verso una casa scelta a caso
    "scatta una foto",
    "facci una foto",
    // mandare senza foto è la cartolina di parole, e la prende parsePostcard
    "manda ai nonni: siamo al parco",
    // niente destinatario
    "scatta una foto e mandala",
    "manda una foto a : ciao",
    // il verbo non apre la frase: è un racconto
    "ieri ho mandato una foto ai nonni",
    // frasi qualunque
    "fammi vedere le foto del parco",
    "come stai?",
  ])("«%s» non è questo gesto", (phrase) => {
    expect(parsePhotoPostcard(phrase)).toBeUndefined();
  });
});
