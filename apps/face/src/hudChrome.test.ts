import { describe, expect, it } from "vitest";
import { parseChrome, toggleChrome } from "./hudChrome.js";

/**
 * Il chiosco nascondibile (ADR-093) — la parte pura.
 *
 * Due stati e una memoria: quello che si prova qui è che una stringa
 * qualunque uscita da localStorage non possa mai lasciare il muso in uno
 * stato che il CSS non conosce.
 */

describe("parseChrome", () => {
  it("riconosce i due stati legittimi", () => {
    expect(parseChrome("esteso")).toBe("esteso");
    expect(parseChrome("nascosto")).toBe("nascosto");
  });

  it("tutto il resto è il chiosco esteso: il default non nasconde niente", () => {
    // un dispositivo nuovo, uno storage svuotato, una stringa corrotta:
    // in ogni caso i comandi devono essere in vista, non spariti
    expect(parseChrome(null)).toBe("esteso");
    expect(parseChrome("")).toBe("esteso");
    expect(parseChrome("qualunque-cosa")).toBe("esteso");
  });
});

describe("toggleChrome", () => {
  it("va e torna, senza terzi stati", () => {
    expect(toggleChrome("esteso")).toBe("nascosto");
    expect(toggleChrome("nascosto")).toBe("esteso");
    expect(toggleChrome(toggleChrome("esteso"))).toBe("esteso");
  });
});
