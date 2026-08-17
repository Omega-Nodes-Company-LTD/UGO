import { describe, expect, it } from "vitest";
import { isEcho, normalize, worthSending } from "./heard.js";

describe("what reaches soul when the face never stops listening", () => {
  it("lets a real sentence through", () => {
    expect(worthSending("ciao UGO, come stai oggi?")).toBe(true);
  });

  it("drops the grunts that are not speech", () => {
    for (const noise of ["eh", "mm", "ah", "", "   ", "sì"]) {
      expect(worthSending(noise)).toBe(false);
    }
  });

  // the expensive one: mic beside speaker, UGO answers himself forever
  it("refuses to answer its own voice", () => {
    const said = "Grunf, oggi sono sereno e ho voglia di chiacchierare";
    expect(worthSending("grunf oggi sono sereno e ho voglia di chiacchierare", { spoken: said }))
      .toBe(false);
    // even partially heard back, punctuation and accents aside
    expect(worthSending("oggi sono sereno, ho voglia di chiacchierare!", { spoken: said }))
      .toBe(false);
  });

  it("still hears a person who answers on the same subject", () => {
    const said = "Grunf, oggi sono sereno";
    expect(worthSending("meno male, allora andiamo a fare la spesa", { spoken: said })).toBe(true);
  });

  // seen in production 2026-08-17: the recognizer garbled Silvio's pitched-up
  // voice («Esplorare il» → «questi rari in»), word overlap fell to 3/6, and
  // he answered his own spoken desire
  it("refuses the garbled echo where only the tail survived", () => {
    const said = "Esplorare il giardino al mattino";
    expect(worthSending("questi rari in giardino al mattino", { spoken: said })).toBe(false);
  });

  it("checks every recent sentence, not only the very last one", () => {
    const spoken = ["Esplorare il giardino al mattino", "Grunf, che fame che ho"];
    expect(worthSending("questi rari in giardino al mattino", { spoken })).toBe(false);
    expect(worthSending("dopo pranzo usciamo a fare due passi insieme", { spoken })).toBe(true);
  });

  it("still hears a person quoting three of his words inside their own sentence", () => {
    const said = "Esplorare il giardino al mattino";
    expect(
      worthSending("secondo me esplorare il giardino adesso è una pessima idea, piove forte", {
        spoken: said,
      }),
    ).toBe(true);
  });

  it("treats accents and punctuation as noise, not as meaning", () => {
    expect(normalize("Perché, però!")).toBe("perche pero");
    expect(isEcho("PERCHÉ PERÒ", "perche pero")).toBe(true);
  });

  it("has nothing to compare against before UGO has spoken", () => {
    expect(isEcho("qualsiasi cosa", undefined)).toBe(false);
    expect(worthSending("qualsiasi cosa detta per prima")).toBe(true);
  });
});
