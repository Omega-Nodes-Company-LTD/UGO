import { describe, expect, it } from "vitest";
import { cleanCode, pairingNeedOf } from "./pairing.js";

describe("l'abbinamento del muso (ADR-121)", () => {
  it("in casa (404) e con la rete giù non chiede codici", () => {
    expect(pairingNeedOf(404, undefined)).toBe("none");
    expect(pairingNeedOf(503, undefined)).toBe("none");
  });

  it("in pubblico chiede il codice solo a chi non è abbinato", () => {
    expect(pairingNeedOf(200, { abbinato: false })).toBe("needed");
    expect(pairingNeedOf(200, { abbinato: true })).toBe("paired");
  });

  it("accetta sei cifre anche scritte con gli spazi, e nient'altro", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("12345")).toBeUndefined();
    expect(cleanCode("12345a")).toBeUndefined();
  });
});
