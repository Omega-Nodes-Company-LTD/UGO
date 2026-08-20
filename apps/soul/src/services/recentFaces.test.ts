import { describe, expect, it } from "vitest";
import { FACE_MEMORY_MS, RecentFaces } from "./recentFaces.js";

const at = (ms: number): Date => new Date(1_700_000_000_000 + ms);

/**
 * Chi c'è — **non chi parla**.
 *
 * La prima stesura rispondeva alla domanda sbagliata: dava un `beingId` da
 * usare come autore della frase quando la voce non bastava, con la guardia
 * «se ne vedo due non rispondo». Il proprietario ha corretto poche ore dopo,
 * e la correzione è più profonda della guardia: **anche con un volto solo in
 * stanza non segue che sia lui a parlare.** Basta qualcuno fuori
 * inquadratura, e la creatura mette in bocca a te una frase che non hai
 * detto — e la scrive in biografia col tuo nome sopra.
 */
describe("chi ho visto poco fa", () => {
  it("dice chi c'è, e con più d'uno li dice tutti", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    faces.saw("monika", at(1_000));
    expect(faces.all(at(2_000)).sort()).toEqual(["francesco", "monika"]);
  });

  it("un volto solo è un presente solo — e resta una presenza, non un autore", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    expect(faces.all(at(1_000))).toEqual(["francesco"]);
  });

  it("oltre la finestra un volto non è più nessuno", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    expect(faces.all(at(FACE_MEMORY_MS + 1))).toEqual([]);
  });

  it("sul bordo esatto c'è ancora: la scadenza è oltre, non a", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    expect(faces.all(at(FACE_MEMORY_MS))).toEqual(["francesco"]);
  });

  it("chi esce dalla finestra sparisce, chi resta rimane", () => {
    const faces = new RecentFaces();
    faces.saw("monika", at(0));
    faces.saw("francesco", at(FACE_MEMORY_MS));
    expect(faces.all(at(FACE_MEMORY_MS + 1))).toEqual(["francesco"]);
  });

  it("rivedere lo stesso volto rinfresca invece di duplicarlo", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    faces.saw("francesco", at(FACE_MEMORY_MS - 1));
    expect(faces.all(at(FACE_MEMORY_MS + 10))).toEqual(["francesco"]);
  });

  it("senza nessuno visto non si inventa niente", () => {
    expect(new RecentFaces().all(at(0))).toEqual([]);
  });

  /** La garanzia è la finestra, non un metodo che qualcuno deve ricordarsi di chiamare. */
  it("si svuota da sola: dopo la finestra non resta niente in memoria", () => {
    const faces = new RecentFaces();
    faces.saw("francesco", at(0));
    faces.saw("monika", at(10));
    expect(faces.all(at(FACE_MEMORY_MS + 11))).toEqual([]);
  });
});
