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

  it("la frase del campo (2026-08-21): il riassunto chiesto con «fai»", () => {
    expect(parseNewsAsk("mi fai un riassunto delle notizie del giorno?")).toEqual({ limit: 3 });
    expect(parseNewsAsk("riassumimi le notizie")).toEqual({ limit: 3 });
    expect(parseNewsAsk("aggiornami sulle notizie")).toEqual({ limit: 3 });
    expect(parseNewsAsk("leggi le notizie")).toEqual({ limit: 3 });
  });

  it("la trappola di \\b: le alternative con l'accento in coda combaciano davvero", () => {
    expect(parseNewsAsk("c'è qualche notizia?")).toEqual({ limit: 3 });
    expect(parseNewsAsk("ci sono novità?")).toEqual({ limit: 3 });
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
    // un riassunto che non parla dei feed non è una rassegna
    expect(parseNewsAsk("il riassunto del telegiornale non mi piace")).toBeUndefined();
    expect(parseNewsAsk("mi fai un riassunto della giornata?")).toBeUndefined();
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
