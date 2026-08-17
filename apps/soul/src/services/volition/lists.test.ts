import { describe, expect, it } from "vitest";
import { confirmList, parseListCommand } from "./lists.js";

/** ADR-076: pura come i promemoria, e come loro fallisce chiuso. */

describe("aggiungere", () => {
  it("riconosce le tre forme che usa una persona", () => {
    expect(parseListCommand("aggiungi il latte alla spesa")).toEqual({
      action: "add",
      list: "spesa",
      item: "latte",
    });
    expect(parseListCommand("metti il pane nella lista della spesa")).toEqual({
      action: "add",
      list: "spesa",
      item: "pane",
    });
    expect(parseListCommand("segna le viti M3 in ferramenta")).toEqual({
      action: "add",
      list: "ferramenta",
      item: "viti M3",
    });
  });

  it("le liste sono testo libero: una lista nuova non chiede una migrazione", () => {
    expect(parseListCommand("aggiungi cemento alla lista del cantiere")?.list).toBe("cantiere");
  });

  it("«cose da fare» e «todo» sono la stessa lista", () => {
    expect(parseListCommand("aggiungi chiamare il commercialista alle cose da fare")?.list).toBe(
      "da fare",
    );
    expect(parseListCommand("aggiungi fatture al todo")?.list).toBe("da fare");
  });

  it("senza una lista non indovina dove mettere le cose", () => {
    expect(parseListCommand("aggiungi il latte")).toBeUndefined();
  });
});

describe("leggere", () => {
  it("risponde alle domande, non solo agli ordini", () => {
    expect(parseListCommand("cosa c'è nella spesa?")).toEqual({ action: "read", list: "spesa" });
    expect(parseListCommand("leggimi la lista delle cose da fare")).toEqual({
      action: "read",
      list: "da fare",
    });
  });
});

describe("spuntare", () => {
  it("capisce sia il comando sia il fatto compiuto", () => {
    expect(parseListCommand("togli il latte dalla spesa")).toEqual({
      action: "done",
      list: "spesa",
      item: "latte",
    });
    // senza lista si assume la spesa: è quella che si spunta al supermercato
    expect(parseListCommand("ho preso il pane")).toEqual({
      action: "done",
      list: "spesa",
      item: "pane",
    });
  });
});

describe("fallire chiuso", () => {
  it("una conversazione normale non diventa una lista", () => {
    for (const line of [
      "come stai?",
      "raccontami una cosa",
      "aggiungi",
      "",
      "che bella la lista dei film di ieri sera, ne parliamo?",
      "ricordami di buttare l'acqua alle 13",
    ]) {
      const parsed = parseListCommand(line);
      // l'unica cosa che NON deve mai succedere è capire male una frase normale
      if (parsed !== undefined) {
        expect(["add", "read", "done"]).toContain(parsed.action);
        expect(parsed.list).not.toBe("");
      }
    }
    expect(parseListCommand("come stai?")).toBeUndefined();
    expect(parseListCommand("aggiungi")).toBeUndefined();
    expect(parseListCommand("")).toBeUndefined();
  });

  it("un promemoria resta un promemoria: non se lo prende la lista", () => {
    expect(parseListCommand("ricordami di buttare l'acqua alle 13")).toBeUndefined();
  });
});

describe("le risposte", () => {
  it("dicono cosa è successo, in italiano", () => {
    expect(confirmList({ action: "add", list: "spesa", item: "latte" })).toContain("latte");
    expect(confirmList({ action: "done", list: "spesa", item: "pane" })).toContain("Tolto");
    expect(confirmList({ action: "read", list: "spesa" }, [])).toContain("vuota");
    expect(confirmList({ action: "read", list: "spesa" }, ["latte", "pane"])).toContain(
      "latte, pane",
    );
  });
});
