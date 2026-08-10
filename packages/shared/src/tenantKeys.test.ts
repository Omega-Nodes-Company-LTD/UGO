import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText } from "./crypto.js";
import { generateDataKey, unwrapDataKey, wrapDataKey } from "./tenantKeys.js";

const master = randomBytes(32);

describe("one data key per house", () => {
  it("round-trips a key through the master key", () => {
    const dek = generateDataKey();
    expect(unwrapDataKey(wrapDataKey(dek, master), master)).toEqual(dek);
  });

  it("gives every house a different key", () => {
    expect(generateDataKey()).not.toEqual(generateDataKey());
  });

  // the whole point: what one family writes, another cannot read
  it("refuses to open one family's data with another's key", () => {
    const casa = generateDataKey();
    const vicini = generateDataKey();
    const secret = encryptText("il corriere si chiama Ivan", casa);

    expect(decryptText(secret, casa)).toBe("il corriere si chiama Ivan");
    expect(() => decryptText(secret, vicini)).toThrow();
  });

  it("refuses a wrapped key that was not wrapped with this master key", () => {
    const wrapped = wrapDataKey(generateDataKey(), master);
    expect(() => unwrapDataKey(wrapped, randomBytes(32))).toThrow();
  });

  // erasure by key destruction (ADR-019): no row rewriting, no trust required
  it("makes a family unreadable once its wrapped key is gone", () => {
    const dek = generateDataKey();
    const wrapped = wrapDataKey(dek, master);
    const secret = encryptText("tutto quello che UGO sapeva", dek);

    // the only copy of the key is the wrapped column; drop it and start over
    const recovered = unwrapDataKey(wrapped, master);
    expect(decryptText(secret, recovered)).toContain("UGO sapeva");
    expect(() => decryptText(secret, generateDataKey())).toThrow();
  });

  it("rejects a data key of the wrong size instead of silently truncating", () => {
    expect(() => wrapDataKey(randomBytes(16), master)).toThrow(/32 bytes/);
  });
});
