import { describe, expect, it } from "vitest";
import { readGestureOf, replyForReading, SceneReader } from "./sceneReader.js";

/**
 * La lettura su gesto (ADR-065): il gesto è una forma chiusa, il giro
 * chiede-aspetta-legge ha quattro esiti e vanno distinti tutti — «non ho un
 * corpo» non è «non c'è scritto niente».
 */

describe("readGestureOf: il gesto esplicito", () => {
  it("riconosce le forme di «leggi»", () => {
    expect(readGestureOf("leggi")).toBe(true);
    expect(readGestureOf("Leggi!")).toBe(true);
    expect(readGestureOf("leggi lo schermo")).toBe(true);
    expect(readGestureOf("ugo, leggimi questo")).toBe(true);
    expect(readGestureOf("  leggi schermo  ")).toBe(true);
  });

  it("una frase che CONTIENE «leggi» non accende la camera", () => {
    expect(readGestureOf("ho letto un libro bellissimo")).toBe(false);
    expect(readGestureOf("leggi il giornale di domani e dimmi cosa succede")).toBe(false);
    expect(readGestureOf("mi leggi nel pensiero?")).toBe(false);
    expect(readGestureOf("leggiadro")).toBe(false);
  });
});

/** un corpo finto col contratto vero: chiede, e allo sguardo dopo risponde */
function bodyWith(image: string | undefined, { fineAsked }: { fineAsked: boolean[] }) {
  let held: string | undefined;
  return {
    hasBody: () => true,
    askGlimpse: (fine = false) => {
      fineAsked.push(fine);
      held = image;
    },
    takeGlimpse: () => {
      const taken = held;
      held = undefined;
      return taken;
    },
  };
}

const FAST = { waitMs: 600, pollMs: 10 };

describe("SceneReader: i quattro esiti", () => {
  it("legge, e chiede lo sguardo FINE (640px, non 320)", async () => {
    const fineAsked: boolean[] = [];
    const reader = new SceneReader({
      gateway: () => bodyWith("jpeg-b64", { fineAsked }),
      ocr: () => Promise.resolve("PROMEMORIA: comprare le mele"),
      ...FAST,
    });
    expect(await reader.read()).toEqual({
      outcome: "read",
      text: "PROMEMORIA: comprare le mele",
    });
    expect(fineAsked).toEqual([true]);
  });

  it("nessun corpo connesso, e lo dice subito", async () => {
    const reader = new SceneReader({
      gateway: () => undefined,
      ocr: () => Promise.resolve(""),
      ...FAST,
    });
    expect(await reader.read()).toEqual({ outcome: "no_body" });
  });

  it("camera spenta: il corpo non risponde e si smette di aspettare", async () => {
    const fineAsked: boolean[] = [];
    const reader = new SceneReader({
      gateway: () => bodyWith(undefined, { fineAsked }),
      ocr: () => Promise.resolve("mai letto"),
      ...FAST,
    });
    expect(await reader.read()).toEqual({ outcome: "no_glimpse" });
  });

  it("OCR giù e pagina bianca sono entrambi illeggibili, con frasi diverse da «niente corpo»", async () => {
    const fineAsked: boolean[] = [];
    const down = new SceneReader({
      gateway: () => bodyWith("jpeg-b64", { fineAsked }),
      ocr: () => Promise.resolve(undefined),
      ...FAST,
    });
    expect(await down.read()).toEqual({ outcome: "unreadable" });
    const blank = new SceneReader({
      gateway: () => bodyWith("jpeg-b64", { fineAsked }),
      ocr: () => Promise.resolve(""),
      ...FAST,
    });
    expect(await blank.read()).toEqual({ outcome: "unreadable" });
    expect(replyForReading({ outcome: "unreadable" })).not.toBe(
      replyForReading({ outcome: "no_body" }),
    );
  });

  it("il testo lungo si tronca nella risposta, non nella lettura", () => {
    const reply = replyForReading({ outcome: "read", text: "x".repeat(2000) });
    expect(reply.length).toBeLessThan(1000);
    expect(reply.endsWith("…")).toBe(true);
  });
});
