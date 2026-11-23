import { describe, expect, it } from "vitest";
import { canonicalSecret, generateRecoveryCode, normalizeRecoveryCode } from "./recoveryCode.js";

describe("the recovery code", () => {
  it("is six groups of four characters, easy to copy by hand", () => {
    expect(generateRecoveryCode()).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/u);
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRecoveryCode()));
    expect(seen.size).toBe(200);
  });

  it("reads back however a person copies it: case, spaces, dashes, look-alike letters", () => {
    const code = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01";
    expect(normalizeRecoveryCode("abcd efgh jkmn pqrs tvwx yz01")).toBe("ABCDEFGHJKMNPQRSTVWXYZ01");
    expect(normalizeRecoveryCode("ABCDEFGHJKMNPQRSTVWXYZ01")).toBe("ABCDEFGHJKMNPQRSTVWXYZ01");
    // Crockford: O reads as 0, I and L read as 1
    expect(normalizeRecoveryCode("ABCD-EFGH-JKMN-PQRS-TVWX-YZOI")).toBe(
      normalizeRecoveryCode(code),
    );
  });

  it("refuses something that is not a code", () => {
    expect(normalizeRecoveryCode("troppo corta")).toBeUndefined();
    expect(normalizeRecoveryCode("ABCD-EFGH-JKMN-PQRS-TVWX-YZ0U")).toBeUndefined(); // U is not in the alphabet
  });

  it("makes a copied code and the typed one derive the same secret", () => {
    expect(canonicalSecret("abcd-efgh-jkmn-pqrs-tvwx-yz01")).toBe(
      canonicalSecret("ABCDEFGHJKMNPQRSTVWXYZ01"),
    );
  });

  it("passes a chosen passphrase through (normalised, not altered)", () => {
    expect(canonicalSecret("la mia frase lunga e segreta")).toBe("la mia frase lunga e segreta");
  });
});
