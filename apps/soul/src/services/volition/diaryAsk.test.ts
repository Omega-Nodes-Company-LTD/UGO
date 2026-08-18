import { describe, expect, it } from "vitest";
import { dateFor, parseDiaryAsk, tellDiary } from "./diaryAsk.js";

/** ADR-079. Puro: le domande vere, e quelle che NON sono domande sul suo diario. */

describe("chiedergli la sua giornata", () => {
  it("le forme che si dicono davvero", () => {
    expect(parseDiaryAsk("cos'hai fatto ieri?")).toEqual({ daysAgo: 1, book: false });
    expect(parseDiaryAsk("che hai fatto oggi?")).toEqual({ daysAgo: 0, book: false });
    expect(parseDiaryAsk("com'è andata ieri?")).toEqual({ daysAgo: 1, book: false });
    expect(parseDiaryAsk("cos'hai fatto l'altro ieri?")).toEqual({ daysAgo: 2, book: false });
  });

  it("e chiedere il libro è un'altra cosa: più pagine, non una", () => {
    expect(parseDiaryAsk("leggimi il diario")).toEqual({ daysAgo: 1, book: true });
    expect(parseDiaryAsk("raccontami il tuo diario")).toEqual({ daysAgo: 1, book: true });
  });

  it("fallisce chiuso: senza un giorno e senza il diario non si indovina", () => {
    // «come è andata?» è «come stai», e a quella risponde lui parlando
    expect(parseDiaryAsk("come è andata?")).toBeUndefined();
    expect(parseDiaryAsk("raccontami una storia")).toBeUndefined();
  });

  it("una frase che PARLA di ieri non è una domanda sul suo diario", () => {
    expect(parseDiaryAsk("ieri sono stato al mare")).toBeUndefined();
    expect(parseDiaryAsk("domani ho il dentista")).toBeUndefined();
    expect(parseDiaryAsk("che giorno è oggi?")).toBeUndefined();
  });
});

describe("il giorno che quella domanda indica", () => {
  it("conta all'indietro, anche attraverso i mesi", () => {
    expect(dateFor("2026-08-18", 1)).toBe("2026-08-17");
    expect(dateFor("2026-08-01", 1)).toBe("2026-07-31");
    expect(dateFor("2026-03-01", 2)).toBe("2026-02-27");
    expect(dateFor("2026-08-18", 0)).toBe("2026-08-18");
  });
});

describe("come lo racconta", () => {
  const page = { date: "2026-08-17", text: "Oggi è passato il corriere e mi sono spaventato." };

  it("una giornata è la sua pagina, parola per parola", () => {
    // niente riassunto del riassunto: riassumere costerebbe un token
    expect(tellDiary([page], { daysAgo: 1, book: false })).toBe(page.text);
  });

  it("il libro sono più pagine, ognuna col suo giorno", () => {
    const told = tellDiary([page, { date: "2026-08-16", text: "Giornata calma." }], {
      daysAgo: 1,
      book: true,
    });
    expect(told).toContain("2026-08-17");
    expect(told).toContain("Giornata calma.");
  });

  it("e quando non c'è niente lo dice, invece di inventare", () => {
    expect(tellDiary([], { daysAgo: 1, book: false })).toContain("non ho scritto niente");
    expect(tellDiary([], { daysAgo: 1, book: true })).toContain("ancora vuoto");
  });
});
