import type { ServerToFaceMessage } from "@ugo/shared";
import { describe, expect, it } from "vitest";
import { SceneHub } from "./sceneHub.js";

/**
 * Chi guarda quale stanza (ADR-056).
 *
 * Due proprietà che valgono un test: che la chiave includa la **casa**, e che
 * smettere di guardare non lasci residui. La prima non è teorica — «cucina» è
 * il nome di stanza più probabile che esista, e due famiglie senza la casa
 * nella chiave si spedirebbero l'arredamento a vicenda.
 */

const scene: ServerToFaceMessage = { type: "scene", props: [] };

describe("SceneHub", () => {
  it("delivers to every screen watching that room", () => {
    const hub = new SceneHub();
    const seen: string[] = [];
    hub.watch("casa", "cucina", () => {
      seen.push("uno");
    });
    hub.watch("casa", "cucina", () => {
      seen.push("due");
    });
    hub.broadcast("casa", "cucina", scene);
    expect(seen.sort()).toEqual(["due", "uno"]);
  });

  it("never crosses the house boundary, even for the same room name", () => {
    const hub = new SceneHub();
    let mine = 0;
    let theirs = 0;
    hub.watch("casa-mia", "cucina", () => (mine += 1));
    hub.watch("casa-loro", "cucina", () => (theirs += 1));
    hub.broadcast("casa-mia", "cucina", scene);
    expect(mine).toBe(1);
    expect(theirs).toBe(0);
  });

  it("matches a room however it was spelled", () => {
    const hub = new SceneHub();
    let seen = 0;
    hub.watch("casa", "  Cucina ", () => (seen += 1));
    hub.broadcast("casa", "CUCINA", scene);
    expect(seen).toBe(1);
  });

  /** Un chiosco che perde la rete ogni minuto non deve far crescere la mappa. */
  it("forgets a screen that closed, and the room with the last of them", () => {
    const hub = new SceneHub();
    const stop = hub.watch("casa", "cucina", () => {
      /* nessuno guarda davvero: qui conta solo che la voce esista */
    });
    expect(hub.watchers_("casa", "cucina")).toBe(1);
    stop();
    expect(hub.watchers_("casa", "cucina")).toBe(0);
    // e un broadcast su una stanza che nessuno guarda non è un errore
    expect(() => {
      hub.broadcast("casa", "cucina", scene);
    }).not.toThrow();
  });
});
