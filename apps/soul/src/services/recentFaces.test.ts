import { describe, expect, it } from "vitest";
import { FACE_MEMORY_MS, RecentFaces } from "./recentFaces.js";

const at = (ms: number): Date => new Date(1_700_000_000_000 + ms);

describe("chi ho visto poco fa", () => {
  it("un volto solo nella finestra risponde a «chi sta parlando»", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    expect(faces.only(at(1_000))).toBe("francesco");
  });

  /**
   * La regola per cui questo file esiste: sbagliare il nome di chi ti sta
   * parlando è peggio che non dirlo. Due presenti, nessun nome.
   */
  it("due volti diversi nella finestra non fanno una risposta", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    faces.saw("monika", at(1_000));
    expect(faces.only(at(2_000))).toBeUndefined();
  });

  it("ma se il secondo è uscito dalla finestra, il primo torna a valere", () => {
    const faces = new RecentFaces();
    faces.saw("monika", at(0));
    faces.saw("francesco", at(FACE_MEMORY_MS));
    // qui monika è appena scaduta: resta solo francesco
    expect(faces.only(at(FACE_MEMORY_MS + 1))).toBe("francesco");
  });

  it("oltre la finestra un volto non è più una risposta", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    expect(faces.only(at(FACE_MEMORY_MS + 1))).toBeUndefined();
  });

  it("sul bordo esatto vale ancora: la scadenza è oltre, non a", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    expect(faces.only(at(FACE_MEMORY_MS))).toBe("francesco");
  });

  it("rivedere lo stesso volto rinfresca invece di duplicarlo", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    faces.saw("francesco", at(FACE_MEMORY_MS - 1));
    // se il primo avvistamento contasse ancora come riga a sé, la finestra
    // conterebbe due volte lo stesso e il conto dei distinti reggerebbe
    // comunque — ma la scadenza no: qui deve valere il più recente
    expect(faces.only(at(FACE_MEMORY_MS + 10))).toBe("francesco");
  });

  it("senza nessuno visto non si inventa niente", () => {
    expect(new RecentFaces().only(at(0))).toBeUndefined();
  });

  /** La garanzia è la finestra, non un metodo che qualcuno deve ricordarsi di chiamare. */
  it("si svuota da sola: dopo la finestra non resta niente in memoria", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    faces.saw("monika", at(10));
    expect(faces.only(at(FACE_MEMORY_MS + 11))).toBeUndefined();
  });
});
