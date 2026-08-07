import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText, isEncrypted, parseDataKey } from "./crypto.js";

// Pure-ish crypto helpers (no I/O, no env): unit territory.

const key = randomBytes(32);

describe("AES-256-GCM at-rest encryption", () => {
  it("round-trips utf8 text including accents and emoji", () => {
    const plain = "Ciao, sono UGO 🐷 — perché così è la vita";
    const encrypted = encryptText(plain, key);
    expect(encrypted).not.toContain("UGO");
    expect(isEncrypted(encrypted)).toBe(true);
    expect(decryptText(encrypted, key)).toBe(plain);
  });

  it("produces a different ciphertext per call (random IV)", () => {
    expect(encryptText("stesso testo", key)).not.toBe(encryptText("stesso testo", key));
  });

  it("rejects tampered ciphertext (auth tag)", () => {
    const encrypted = encryptText("integrità", key);
    const packed = Buffer.from(encrypted.slice(3), "base64");
    packed[13] = (packed[13] ?? 0) ^ 0xff; // flip one ciphertext bit
    const tampered = "v1:" + packed.toString("base64");
    expect(() => decryptText(tampered, key)).toThrow();
  });

  it("rejects the wrong key", () => {
    const encrypted = encryptText("segreto", key);
    expect(() => decryptText(encrypted, randomBytes(32))).toThrow();
  });

  it("rejects unknown versions and truncated payloads", () => {
    expect(() => decryptText("v2:abcd", key)).toThrow(/version/);
    expect(() => decryptText("v1:" + Buffer.alloc(4).toString("base64"), key)).toThrow(/short/);
  });

  it("parseDataKey enforces 32 bytes", () => {
    expect(() => parseDataKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(parseDataKey(Buffer.alloc(32).toString("base64")).length).toBe(32);
  });
});
