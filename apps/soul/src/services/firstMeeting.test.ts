import { describe, expect, it } from "vitest";
import { firstMeetingLine, makesAPromise } from "./firstMeeting.js";

/**
 * Il saluto del primo incontro (UGOMKT-11, copione V3): testo fisso, quindi
 * funzione pura. Le regole che deve rispettare vengono da `rules.it.md` e
 * `identity.it.md`: due frasi a voce, niente markdown né emoji, mai servile.
 */
const sentences = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+/u).filter((part) => part.trim() !== "");

describe("firstMeetingLine (formula V3)", () => {
  it("è la formula scelta, col nome della creatura", () => {
    expect(firstMeetingLine("Ugo")).toBe(
      "Grunf, piacere: io sono Ugo. Tu come ti chiami, e che cosa hai fatto oggi?",
    );
  });

  it("dice il nome della creatura: è quello che apre il cancello del nome", () => {
    expect(firstMeetingLine("Briciola")).toContain("Briciola");
  });

  it("sta entro due frasi e finisce con una domanda", () => {
    const line = firstMeetingLine("Ugo");
    expect(sentences(line).length).toBeLessThanOrEqual(2);
    expect(line.endsWith("?")).toBe(true);
  });

  it("è parlabile: niente markdown, elenchi né emoji", () => {
    const line = firstMeetingLine("Ugo");
    expect(line).not.toMatch(/[*_#`>\n]/u);
    expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("non è servile e non promette", () => {
    const line = firstMeetingLine("Ugo");
    expect(line).not.toMatch(/come posso aiutarti/iu);
    expect(makesAPromise(line)).toBe(false);
  });

  it("ripulisce gli spazi del nome senza cambiarlo", () => {
    expect(firstMeetingLine("  Ugo \n")).toBe(firstMeetingLine("Ugo"));
  });
});

describe("makesAPromise: le frasi che non si dicono", () => {
  it.each([
    "Mi ricorderò di te.",
    "mi ricordero' di tutto",
    "Non lo dimenticherò.",
    "Non dimenticherò il tuo nome.",
    "Non ti scorderò.",
    "Non ti dimentico.",
    "Me lo segno, tranquilla.",
    "Domani ti chiederò com'è andata.",
    "Ricorderò tutto.",
  ])("riconosce «%s»", (text) => {
    expect(makesAPromise(text)).toBe(true);
  });

  it.each([
    "Piacere, Giulia. Com'è andato il trasloco?",
    "Grunf, a presto, Marta.",
    "Ricordo che l'hai detto oggi.",
    "Com'è andato il colloquio?",
    "Stammi bene e non dimenticarti di riposare le gambette.",
    "Non dimenticare di riposare, eh.",
    "Ricordati di chiamare tua sorella.",
  ])("lascia passare «%s»", (text) => {
    expect(makesAPromise(text)).toBe(false);
  });
});
