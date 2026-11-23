import { randomBytes } from "node:crypto";
import { encryptText } from "@ugo/shared";
import { describe, expect, it } from "vitest";
import type { TablePolicy } from "./policy.js";
import { KeyRing, looksEncrypted, openRow, StrayCiphertextError, UndecryptableError } from "./rowCrypto.js";

const master = randomBytes(32);
const house = randomBytes(32);
const creature = randomBytes(32);
const stranger = randomBytes(32);
const ring = new KeyRing([master, house, creature]);
const policy: TablePolicy = { encrypted: ["text"] };

describe("recognising ciphertext", () => {
  it("accepts what encryptText produces", () => {
    expect(looksEncrypted(encryptText("ciao", master))).toBe(true);
    expect(looksEncrypted(encryptText("", master))).toBe(true);
  });

  it("does not take ordinary text for ciphertext, even when it starts like it", () => {
    expect(looksEncrypted("v1: lanciato in produzione")).toBe(false);
    expect(looksEncrypted("v1:")).toBe(false);
    expect(looksEncrypted("v1:abc")).toBe(false);
    expect(looksEncrypted("il fattorino si chiama Ivan")).toBe(false);
  });
});

describe("opening a row", () => {
  it("decrypts a declared column whichever key wrote it", () => {
    for (const key of [master, house, creature]) {
      const row = openRow("messages", policy, ring, { id: "1", text: encryptText("che bella giornata", key) });
      expect(row.text).toBe("che bella giornata");
    }
  });

  it("leaves a declared column alone when it was written in the clear (memories, ADR-091)", () => {
    expect(openRow("memories", policy, ring, { id: "1", text: "il fattorino si chiama Ivan" }).text).toBe(
      "il fattorino si chiama Ivan",
    );
  });

  it("keeps a plain memory that merely starts with the version prefix", () => {
    const text = "v1: la prima versione del sito è andata online";
    expect(openRow("memories", policy, ring, { id: "1", text }).text).toBe(text);
  });

  it("refuses a value no key opens, naming the table, column and row but never the value", () => {
    const secret = encryptText("segretissimo", stranger);
    try {
      openRow("messages", policy, ring, { id: "row-7", text: secret });
      expect.unreachable("must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UndecryptableError);
      const e = error as UndecryptableError;
      expect([e.table, e.column, e.rowId]).toEqual(["messages", "text", "row-7"]);
      expect(e.message).not.toContain("segretissimo");
      expect(e.message).not.toContain(secret);
    }
  });

  it("refuses ciphertext hiding in a column the policy calls plain", () => {
    const sneaky = { id: "1", notes: encryptText("nascosto", master) };
    expect(() => openRow("beings", {}, ring, sneaky)).toThrow(StrayCiphertextError);
  });

  it("finds ciphertext inside a jsonb value too", () => {
    const payload = { a: { b: [encryptText("nascosto", house)] } };
    expect(() => openRow("events", {}, ring, { id: "1", payload })).toThrow(StrayCiphertextError);
  });

  it("does not mistake ciphertext of a foreign key for a stray (it is not ours to read)", () => {
    // a value that *looks* encrypted but opens with none of our keys is only a
    // problem in a declared column; in a plain one it is just text we cannot open
    const foreign = { id: "1", note: encryptText("di un'altra casa", stranger) };
    expect(openRow("beings", {}, ring, foreign).note).toBe(foreign.note);
  });

  it("passes non-string values through untouched", () => {
    const row = { id: "1", n: 3, flag: false, nothing: null, when: "2026-11-23T10:00:00+00:00" };
    expect(openRow("events", {}, ring, row)).toEqual(row);
  });
});

describe("the key ring", () => {
  it("needs at least one key", () => {
    expect(() => new KeyRing([])).toThrow(RangeError);
  });
});
