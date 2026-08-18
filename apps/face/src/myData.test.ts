import { describe, expect, it } from "vitest";
import { nameMatches, refusalMessage, summaryLines } from "./myData.js";

/**
 * «I tuoi dati» (ADR-090) — la parte pura.
 *
 * Due cose sole, e sono le due che, sbagliate, fanno danno: quello che si
 * mostra su uno schermo che vedono tutti, e il cancello prima di una cosa
 * irreversibile.
 */

const EMPTY = {
  beings: 0,
  protected: 0,
  messages: 0,
  memories: 0,
  diaryPages: 0,
  transcriptSegments: 0,
  prints: 0,
  sightings: 0,
  strangers: 0,
};

describe("cosa mostra", () => {
  it("mostra le righe anche quando valgono zero", () => {
    // nascondere uno zero lascerebbe credere che la domanda non sia stata fatta
    const lines = summaryLines(EMPTY);
    expect(lines).toHaveLength(9);
    expect(lines.every((line) => line.value === 0)).toBe(true);
  });

  it("segna quali righe parlano di corpi", () => {
    const body = summaryLines(EMPTY).filter((line) => line.body === true);
    expect(body.map((line) => line.label).join(" ")).toContain("impronte");
    expect(body).toHaveLength(3);
  });

  it("nessuna riga porta un contenuto: solo conti", () => {
    const lines = summaryLines({ ...EMPTY, memories: 42, messages: 7 });
    for (const line of lines) {
      expect(typeof line.value).toBe("number");
      // le etichette sono nostre, scritte a mano: niente arriva dal database
      expect(line.label).not.toContain("undefined");
    }
    expect(lines.find((line) => line.label === "ricordi")?.value).toBe(42);
  });
});

describe("il cancello prima dell'irreversibile", () => {
  it("il nome deve combaciare", () => {
    expect(nameMatches("Monika", "Monika")).toBe(true);
    expect(nameMatches("monika", "Monika")).toBe(true);
    expect(nameMatches("  Monika  ", "Monika")).toBe(true);
  });

  it("un nome vuoto non è una conferma", () => {
    expect(nameMatches("", "Monika")).toBe(false);
    expect(nameMatches("   ", "Monika")).toBe(false);
  });

  it("un nome sbagliato nemmeno, e nemmeno uno che gli somiglia", () => {
    expect(nameMatches("Monica", "Monika")).toBe(false);
    expect(nameMatches("Moni", "Monika")).toBe(false);
  });
});

describe("le parole del rifiuto", () => {
  it("un token che non basta è una cosa, un id che non c'è è un'altra", () => {
    expect(refusalMessage(403)).toContain("token");
    expect(refusalMessage(404)).toContain("già stato cancellato");
    expect(refusalMessage(500)).toContain("500");
  });
});
