import { describe, expect, it } from "vitest";
import { REDACTION, buildRedactor, redactJson } from "./redaction.js";

// Pure functions: the only unit-testable part of the erasure pipeline.

describe("buildRedactor", () => {
  it("redacts the name case-insensitively, whole words only", () => {
    const redact = buildRedactor(["Ivan"]);
    expect(redact("Ivan ha portato il pacco")).toBe(`${REDACTION} ha portato il pacco`);
    expect(redact("ho visto IVAN ieri")).toBe(`ho visto ${REDACTION} ieri`);
    // substring inside another word must survive: erasure is not censorship
    expect(redact("la stufa a ivanite non esiste")).toBe("la stufa a ivanite non esiste");
  });

  it("handles accented names and punctuation boundaries", () => {
    const redact = buildRedactor(["Niccolò"]);
    expect(redact("Chiedi a Niccolò, poi richiama")).toBe(`Chiedi a ${REDACTION}, poi richiama`);
    expect(redact("«Niccolò»")).toBe(`«${REDACTION}»`);
  });

  it("prefers the longest match so full names win over first names", () => {
    const redact = buildRedactor(["Mario", "Mario Rossi"]);
    expect(redact("Mario Rossi ha firmato")).toBe(`${REDACTION} ha firmato`);
  });

  it("redacts every alias", () => {
    const redact = buildRedactor(["Giovanni", "Gianni", "Nanni"]);
    expect(redact("Gianni e Nanni sono Giovanni")).toBe(
      `${REDACTION} e ${REDACTION} sono ${REDACTION}`,
    );
  });

  it("ignores terms too short to be identifying and escapes regex metachars", () => {
    expect(buildRedactor(["a"])("a b c")).toBe("a b c");
    expect(buildRedactor([])("niente da fare")).toBe("niente da fare");
    expect(buildRedactor(["C++"])("uso C++ ogni giorno")).toBe(`uso ${REDACTION} ogni giorno`);
  });

  it("is idempotent: redacting twice changes nothing more", () => {
    const redact = buildRedactor(["Ivan"]);
    const once = redact("Ivan ha detto a Ivan di chiamare Ivan");
    expect(redact(once)).toBe(once);
  });
});

describe("redactJson", () => {
  it("walks nested payloads, leaving non-strings untouched", () => {
    const redact = buildRedactor(["Ivan"]);
    expect(
      redactJson({ who: "Ivan", db: 92, tags: ["Ivan", 3, null], deep: { note: "con Ivan" } }, redact),
    ).toEqual({
      who: REDACTION,
      db: 92,
      tags: [REDACTION, 3, null],
      deep: { note: `con ${REDACTION}` },
    });
  });
});
