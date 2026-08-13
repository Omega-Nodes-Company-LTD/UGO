import { describe, expect, it } from "vitest";
import { UNVERSIONED, buildIdOf, shouldReload } from "./version.js";

describe("buildIdOf", () => {
  it("reads the id out of a built bundle URL", () => {
    expect(buildIdOf("https://casa.local/assets/index-Bqlezltc.js")).toBe("Bqlezltc");
    expect(buildIdOf("/assets/index-BzS56lvP.js?v=1")).toBe("BzS56lvP");
  });

  it("says 'dev' when there is no build, instead of inventing one", () => {
    expect(buildIdOf("http://127.0.0.1:4173/src/version.ts")).toBe(UNVERSIONED);
    expect(buildIdOf("")).toBe(UNVERSIONED);
    // un altro chunk non e' il bundle principale: non ne ricava una versione
    expect(buildIdOf("/assets/renderer3d-BieAY1aG.js")).toBe(UNVERSIONED);
  });
});

describe("shouldReload", () => {
  it("reloads exactly when the two known versions differ", () => {
    expect(shouldReload("Bqlezltc", "NEW00000")).toBe(true);
    expect(shouldReload("Bqlezltc", "Bqlezltc")).toBe(false);
  });

  /**
   * Il caso che conta: un chiosco che ricarica a vuoto mentre qualcuno gli sta
   * parlando e' peggio del problema che risolve. Quindi nel dubbio non ricarica
   * mai — e il dubbio e' «una delle due parti non sa che versione e'».
   */
  it("never reloads on a version it cannot know", () => {
    expect(shouldReload("Bqlezltc", undefined)).toBe(false);
    expect(shouldReload("Bqlezltc", UNVERSIONED)).toBe(false);
    expect(shouldReload(UNVERSIONED, "Bqlezltc")).toBe(false);
    expect(shouldReload(UNVERSIONED, UNVERSIONED)).toBe(false);
  });
});
