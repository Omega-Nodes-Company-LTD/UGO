import { describe, expect, it } from "vitest";
import { SearxClient, searchQueryOf, WebWindow } from "./webSearch.js";

/**
 * La finestra sul mondo (ADR-063): il gesto esplicito, il client contro uno
 * stub di rete vero, e la sintesi col suo ripiego deterministico.
 */

describe("searchQueryOf: il gesto esplicito", () => {
  it("riconosce le forme di «cerca» e restituisce la domanda", () => {
    expect(searchQueryOf("cerca: gare di go-kart vicino a roma")).toBe(
      "gare di go-kart vicino a roma",
    );
    expect(searchQueryOf("Cercami le novità su postgres 17")).toBe("le novità su postgres 17");
    expect(searchQueryOf("  cerca previsioni per domani ")).toBe("previsioni per domani");
  });

  it("una frase qualunque NON apre la finestra", () => {
    expect(searchQueryOf("oggi ho cercato le chiavi tutto il giorno")).toBeUndefined();
    expect(searchQueryOf("ricercatore")).toBeUndefined();
    expect(searchQueryOf("cerca")).toBeUndefined();
  });
});

const RESULTS = {
  results: [
    { title: "Kartodromo di Roma", url: "https://www.kart.example/roma", content: "Piste e gare ogni weekend" },
    { title: "Calendario gare", url: "https://gare.example/cal", content: "Le prossime date" },
  ],
};

function searx(answer: object | undefined): SearxClient {
  return new SearxClient({
    baseUrl: "http://searxng.local",
    fetchImpl: (() => {
      if (answer === undefined) return Promise.reject(new Error("down"));
      return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
    }),
  });
}

describe("la finestra", () => {
  it("senza modello locale elenca i titoli, onesti e deterministici", async () => {
    const window = new WebWindow({ searx: searx(RESULTS) });
    const reply = await window.ask("gare di go-kart");
    expect(reply).toContain("Kartodromo di Roma");
    expect(reply).toContain("kart.example");
    expect(reply).toContain("Grunf");
  });

  it("col modello locale su, la sintesi ha le sue parole", async () => {
    const window = new WebWindow({
      searx: searx(RESULTS),
      local: {
        generate: () => Promise.resolve("Grunf! Ci sono gare al kartodromo ogni weekend."),
        available: () => Promise.resolve(true),
      },
      localUp: () => true,
    });
    expect(await window.ask("gare di go-kart")).toContain("kartodromo ogni weekend");
  });

  it("zero risultati è una risposta, SearXNG giù è undefined (e chi chiama degrada)", async () => {
    expect(await new WebWindow({ searx: searx({ results: [] }) }).ask("xyzzy")).toContain(
      "non ho trovato niente",
    );
    expect(await new WebWindow({ searx: searx(undefined) }).ask("xyzzy")).toBeUndefined();
  });
});
