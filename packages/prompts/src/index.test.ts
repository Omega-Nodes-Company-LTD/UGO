import { describe, expect, it } from "vitest";
import { identityPrompt, rulesPrompt } from "./index.js";

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
