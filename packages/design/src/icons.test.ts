import { describe, expect, it } from "vitest";
import { icon, ICON_NAMES } from "./icons.js";

describe("le icone", () => {
  it("sono SVG con currentColor e senza riempimenti di testo", () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('aria-hidden="true"');
    }
  });
  it("con un'etichetta parlano allo screen reader invece di tacere", () => {
    expect(icon("pig", "UGO")).toContain('aria-label="UGO"');
  });
});
