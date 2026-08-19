import { describe, expect, it } from "vitest";
import { parseWeekAsk, weekPrompt } from "./weekAsk.js";

describe("parseWeekAsk: servono il verbo e la settimana", () => {
  it("riconosce le forme che una persona usa davvero", () => {
    for (const text of [
      "riassumimi la settimana",
      "com'è andata la settimana?",
      "come è andata questa settimana",
      "raccontami questi giorni",
      "riassumi gli ultimi sette giorni",
    ]) {
      expect(parseWeekAsk(text), text).toBe(true);
    }
  });

  /**
   * Fallisce chiuso, come tutti i verbi di questo binario: senza la settimana
   * nominata non è questa domanda, ed è meglio lasciarla alla conversazione
   * che rispondere con un riassunto che nessuno ha chiesto.
   */
  it("non ruba le domande dei vicini", () => {
    for (const text of [
      "com'è andata ieri?",
      "riassumimi la riunione",
      "che settimana!",
      "come stai",
    ]) {
      expect(parseWeekAsk(text), text).toBe(false);
    }
  });
});

describe("weekPrompt", () => {
  it("porta le date, perché una settimana senza giorni è un giorno solo", () => {
    const prompt = weekPrompt([
      { date: "2026-08-17", text: "è saltata la consegna" },
      { date: "2026-08-18", text: "montata la libreria" },
    ]);
    expect(prompt).toContain("2026-08-17: è saltata la consegna");
    expect(prompt).toContain("2026-08-18: montata la libreria");
    expect(prompt).toMatch(/non inventarla/u);
  });
});
