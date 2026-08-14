import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, identityPrompt, rulesPrompt } from "./index.js";

// File loading of package-local versioned artifacts; content assertions are
// stability guarantees for the prompt-cache discipline (§5.5).

describe("prompt blocks", () => {
  it("returns byte-identical strings across calls (cache-stable prefix)", () => {
    expect(identityPrompt()).toBe(identityPrompt());
    expect(rulesPrompt()).toBe(rulesPrompt());
  });

  it("identity is non-empty Italian text mentioning UGO", () => {
    const identity = identityPrompt();
    expect(identity.length).toBeGreaterThan(200);
    expect(identity).toContain("UGO");
    expect(identity).toContain("porcetto");
  });

  it("rules constrain home replies to 2 sentences and forbid markdown", () => {
    const rules = rulesPrompt();
    expect(rules).toMatch(/massimo 2 frasi/i);
    expect(rules).toMatch(/markdown/i);
  });

  it("contains no template placeholders (never interpolate dynamic data)", () => {
    for (const block of [identityPrompt(), rulesPrompt()]) {
      expect(block).not.toMatch(/\$\{|\{\{|%s|<DA_/);
    }
  });
});

/**
 * ADR-050. La promessa non e' «traduce», che oggi non fa: e' che tradurre
 * significhera' N file e N cache, e mai un dato variabile dentro un blocco
 * cached (regola 2). Il ripiego e' cio' che rende quella promessa spedibile
 * con una lingua sola.
 */
describe("una cache per lingua", () => {
  it("falls back to Italian for a language nobody has written yet", () => {
    expect(identityPrompt("en-GB")).toBe(identityPrompt(DEFAULT_LOCALE));
    expect(rulesPrompt("sw-UG")).toBe(rulesPrompt(DEFAULT_LOCALE));
  });

  it("keeps a locale byte-stable, which is what the cache is bought with", () => {
    expect(identityPrompt("en-GB")).toBe(identityPrompt("en-GB"));
    // la variante regionale non cambia il file: `it-CH` e `it-IT` sono l'italiano
    expect(identityPrompt("it-CH")).toBe(identityPrompt("it-IT"));
  });

  it("still has no placeholder to interpolate a language into", () => {
    // se un giorno qualcuno «risolvesse» il multilingua con «rispondi in {x}»,
    // questa riga diventa rossa prima che il prompt parta
    for (const block of [identityPrompt("en-GB"), rulesPrompt("en-GB")]) {
      expect(block).not.toMatch(/\{lingua\}|\{locale\}|\$\{/);
    }
  });
});
