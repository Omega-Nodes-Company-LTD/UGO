import { describe, expect, it } from "vitest";
import { contrast } from "./contrast.js";
import { CONTRAST_PAIRS, DARK, LIGHT } from "./palette.js";

describe("la palette regge (WCAG 2.2 AA)", () => {
  it("misura come dice lo standard", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
  for (const [name, palette] of [
    ["chiaro", LIGHT],
    ["scuro", DARK],
  ] as const) {
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      it(`${name}: ${fg} su ${bg} ≥ ${String(min)}`, () => {
        expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
