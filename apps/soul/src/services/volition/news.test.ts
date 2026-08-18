import { describe, expect, it } from "vitest";
import { parseNewsAsk, tellNews } from "./news.js";

/** ADR-080. Puro: le domande vere, e le frasi che nominano una notizia senza chiederla. */

describe("chiedere la rassegna", () => {
  it("le forme che si dicono", () => {
    for (const phrase of [
      "che notizie ci sono?",
      "leggimi le notizie",
      "dimmi le novità",
      "cosa c'è di nuovo dai feed?",
      "fammi la rassegna",
    ]) {
      expect(parseNewsAsk(phrase), phrase).toEqual({ limit: 3 });
    }
  });

  it("se dici quante ne vuoi, sono quelle", () => {
    expect(parseNewsAsk("leggimi cinque notizie")).toEqual({ limit: 5 });
    expect(parseNewsAsk("dammi 2 titoli")).toEqual({ limit: 2 });
    // e non si legge un feed reader intero a voce
    expect(parseNewsAsk("leggimi 40 notizie")).toEqual({ limit: 8 });
  });

  it("fallisce chiuso: nominare una notizia non è chiederla", () => {
    expect(parseNewsAsk("ho letto una notizia interessante")).toBeUndefined();
    expect(parseNewsAsk("le notizie di ieri erano brutte")).toBeUndefined();
    expect(parseNewsAsk("come stai?")).toBeUndefined();
  });
});

describe("come la legge", () => {
  const items = [
    { title: "Il telescopio ha visto una cosa nuova", feed: "Il Post" },
    { title: "Rilasciato Postgres 18", feed: "Ars Technica" },
  ];

  it("i titoli restano le parole di chi li ha scritti", () => {
    const told = tellNews(items, 2);
    expect(told).toContain("Il telescopio ha visto una cosa nuova");
    expect(told).toContain("Da Ars Technica:");
    expect(told).toContain("2 cose");
  });

  it("niente feed e niente novità sono due risposte diverse", () => {
    expect(tellNews([], 0)).toContain("Non sei iscritto");
    expect(tellNews([], 3)).toContain("niente di nuovo");
  });

  it("una sola non si annuncia al plurale", () => {
    expect(tellNews([items[0] ?? { title: "x", feed: "y" }], 1)).toContain("Una cosa sola");
  });
});
