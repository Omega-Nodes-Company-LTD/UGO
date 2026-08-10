import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { ADMIN_SCRIPT } from "./script.js";
import { ADMIN_PAGE } from "./page.js";

/**
 * The panel is assembled from several modules concatenated into one script, so
 * two of them can each declare `const SPECIES_LABEL` and be individually
 * fine — while the result dies at parse time and takes the whole page with it.
 *
 * That is exactly what happened, and it survived a local e2e run because the
 * filtered command did not rebuild soul. `new Script` compiles without
 * running, which is all this needs: a duplicate declaration is an early
 * error, raised before a single line executes.
 */
describe("the assembled panel script", () => {
  it("parses, so a duplicate declaration across modules cannot ship", () => {
    expect(() => new Script(ADMIN_SCRIPT)).not.toThrow();
  });

  it("declares each top-level const exactly once", () => {
    const names = [...ADMIN_SCRIPT.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1],
    );
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });

  it("wires every element the script reaches for", () => {
    const ids = new Set([...ADMIN_PAGE.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
    const wanted = [...ADMIN_SCRIPT.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
    const missing = [...new Set(wanted)].filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });
});
