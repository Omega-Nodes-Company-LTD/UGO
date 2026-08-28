import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { servedBuildId } from "./faceStatic.js";

describe("servedBuildId — il nome del bundle che soul sta servendo", () => {
  it("estrae l'hash dal file index-<hash>.js di vite", () => {
    const dir = mkdtempSync(join(tmpdir(), "ugo-face-static-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "index-a1b2c3.js"), "/* */");
    expect(servedBuildId(dir)).toBe("a1b2c3");
  });

  it("torna 'dev' quando non c'è una build (sviluppo, vite serve il muso)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ugo-face-empty-"));
    expect(servedBuildId(dir)).toBe("dev");
  });
});