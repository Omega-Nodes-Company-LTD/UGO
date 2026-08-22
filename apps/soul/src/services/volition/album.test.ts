import { describe, expect, it } from "vitest";
import { parseShot, parseShow, SHOW_DEFAULT, windowFor } from "./album.js";

/**
 * ADR-109: i due gesti dell'album. Una foto scattata per sbaglio è una foto
 * che qualcuno non voleva, quindi qui si prova soprattutto cosa NON è il gesto.
 */

describe("parseShot: «scatta una foto»", () => {
  it.each(["scatta una foto", "Facci una foto!", "ugo, fammi una foto", "scattaci una foto"])(
    "«%s» è lo scatto",
    (phrase) => {
      expect(parseShot(phrase)).toEqual({ kind: "shot" });
    },
  );

  it.each([
    // una frase che PARLA di foto non scatta niente
    "mi piace questa foto",
    "hai visto la foto che ti ho mandato?",
    "scatta",
    "fammi una domanda",
    "fammi vedere le foto",
  ])("«%s» non scatta", (phrase) => {
    expect(parseShot(phrase)).toBeUndefined();
  });
});

describe("parseShow: «fammi vedere gli scatti del parco»", () => {
  it("legge quantità, cosa e quando", () => {
    expect(parseShow("fammi vedere un paio di scatti del parco di stamattina")).toEqual({
      kind: "show",
      words: "parco",
      count: 2,
      when: "stamattina",
    });
  });

  it("senza quantità usa il default, senza soggetto mostra le ultime", () => {
    expect(parseShow("mostrami le foto")).toEqual({
      kind: "show",
      words: "",
      count: SHOW_DEFAULT,
    });
    expect(parseShow("fammi vedere qualche foto di ieri")).toEqual({
      kind: "show",
      words: "",
      count: 3,
      when: "ieri",
    });
  });

  it.each([
    // senza la parola «foto» non è questo gesto: «fammi vedere» è troppo vago
    "fammi vedere",
    "fammi vedere come stai",
    "mostrami il diario",
    "come stai?",
  ])("«%s» non apre l'album", (phrase) => {
    expect(parseShow(phrase)).toBeUndefined();
  });
});

describe("windowFor: la finestra che una parola disegna", () => {
  const now = new Date("2026-08-19T18:30:00");

  it("stamattina finisce a mezzogiorno passato, non a mezzanotte", () => {
    const window = windowFor("stamattina", now);
    expect(window.since?.getHours()).toBe(0);
    expect(window.until?.getHours()).toBe(13);
    expect(window.until?.getDate()).toBe(19);
  });

  it("ieri è un giorno chiuso, oggi è aperto fino ad adesso", () => {
    const yesterday = windowFor("ieri", now);
    expect(yesterday.since?.getDate()).toBe(18);
    expect(yesterday.until?.getDate()).toBe(19);
    expect(windowFor("oggi", now).until).toBeUndefined();
    expect(windowFor(undefined, now)).toEqual({});
  });
});
