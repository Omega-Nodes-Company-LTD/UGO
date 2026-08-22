import { describe, expect, it } from "vitest";
import { composeKeepsake, keepsakeGestureOf, replyForKeepsake } from "./sceneMemory.js";

/**
 * ADR-108. Il gesto è una forma chiusa e ha due vicini pericolosi: il
 * promemoria («ricordami di…», ADR-028) e la domanda alla memoria («cosa ti
 * ricordi di marzo?», ADR-086). Qui si prova soprattutto che non li mangi.
 */

describe("keepsakeGestureOf: il gesto", () => {
  it.each([
    "ricordati questo",
    "Ricordati questo!",
    "ugo, ricordati questa cosa",
    "guarda e ricordati questo",
    "segnati questo",
    "memorizza quello che vedi",
    "  ricordati bene questo  ",
  ])("«%s» è il gesto", (phrase) => {
    expect(keepsakeGestureOf(phrase)).toBe(true);
  });

  it.each([
    // ha un compito dentro: è un promemoria, e vince ADR-028
    "ricordami di comprare il latte",
    "ricordati di chiamare la mamma",
    // è una domanda alla memoria: ADR-086
    "cosa ti ricordi di marzo?",
    "ti ricordi quanto costava?",
    // è qualcuno che racconta
    "mi ricordo che da bambino avevo un cane",
    "ricordati che domani piove",
    // frasi qualunque
    "come stai?",
    "leggi lo schermo",
  ])("«%s» prosegue verso il resto", (phrase) => {
    expect(keepsakeGestureOf(phrase)).toBe(false);
  });
});

describe("composeKeepsake: due occhi, una frase", () => {
  it("mette la scena davanti e le lettere dietro", () => {
    // l'ordine è il senso: si cerca «PC rosso» e dentro si trova il prezzo
    expect(composeKeepsake("un computer rosso su un tavolo", "GAMER PC  749,00 €")).toBe(
      "Ho guardato: un computer rosso su un tavolo C'era scritto: GAMER PC 749,00 €",
    );
  });

  it("regge una metà sola, da tutte e due le parti", () => {
    expect(composeKeepsake("un cane che dorme", undefined)).toBe("Ho guardato: un cane che dorme");
    expect(composeKeepsake(undefined, "USCITA")).toBe(
      "Ho guardato, e c'era scritto: USCITA",
    );
    expect(composeKeepsake("", "   ")).toBeUndefined();
    expect(composeKeepsake(undefined, undefined)).toBeUndefined();
  });

  it("un ricordo non è un documento: il testo letto si tronca", () => {
    const wall = "a".repeat(500);
    const text = composeKeepsake("una parete di testo", wall) ?? "";
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(400);
  });
});

describe("replyForKeepsake: quattro esiti, quattro risposte", () => {
  it("non confonde «non ho occhi» con «non ho capito»", () => {
    const said = [
      replyForKeepsake({ outcome: "no_body" }),
      replyForKeepsake({ outcome: "no_glimpse" }),
      replyForKeepsake({ outcome: "blind" }),
      replyForKeepsake({ outcome: "kept", text: "Ho guardato: una mela" }),
    ];
    expect(new Set(said).size).toBe(4);
    expect(said[3]).toContain("una mela");
  });
});
