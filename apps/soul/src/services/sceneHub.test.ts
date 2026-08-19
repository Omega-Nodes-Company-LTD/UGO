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

/**
 * ADR-101: `connected()` — chi è collegato adesso, stanza per stanza.
 *
 * Il caso che conta è il **prefisso**: le chiavi sono `"<account> <stanza>"`,
 * e un account il cui id fosse prefisso di un altro avrebbe risposto anche
 * per il vicino. Lo spazio nel mezzo lo impedisce, e questo test lo prova
 * invece di fidarsi.
 */
describe("SceneHub.connected (ADR-101)", () => {
  it("elenca le stanze vive della SOLA casa che chiede", () => {
    const hub = new SceneHub();
    const noop = (): void => undefined;
    hub.watch("casa", "cucina", noop);
    hub.watch("casa", "cucina", () => undefined);
    hub.watch("casa", "studio", noop);
    hub.watch("casa-lunga", "salotto", noop);

    expect(hub.connected("casa")).toEqual([
      { room: "cucina", screens: 2 },
      { room: "studio", screens: 1 },
    ]);
    expect(hub.connected("casa-lunga")).toEqual([{ room: "salotto", screens: 1 }]);
    expect(hub.connected("nessuno")).toEqual([]);
  });

  it("una stanza che si svuota sparisce dall'elenco", () => {
    const hub = new SceneHub();
    const stop = hub.watch("casa", "cucina", () => undefined);
    expect(hub.connected("casa")).toHaveLength(1);
    stop();
    expect(hub.connected("casa")).toEqual([]);
  });
});
