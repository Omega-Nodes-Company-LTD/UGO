import { describe, expect, it } from "vitest";
import {
  attentionOf,
  NECK_LIMIT,
  OUT_OF_SIGHT,
  PUPIL_SPAN,
  VIEWER_SPREAD,
} from "./attention.js";

/**
 * Il test che non esisteva.
 *
 * Su `gaze`, `faceLocator`, `inhabitant` e `wander` non c'era una riga, e
 * `pose.test.ts` passa `{x:0,y:0}` quasi ovunque: nessuna asserzione diceva che
 * uno sguardo a destra produca una pupilla a destra. Era copertura che dà
 * sicurezza senza darne, e il difetto che ci è passato sotto è grosso quanto un
 * corpo girato di 180°.
 */

describe("attentionOf", () => {
  it("looks straight ahead at somebody straight ahead", () => {
    const a = attentionOf(0, 0);
    expect(a.sees).toBe(true);
    expect(a.yaw).toBe(0);
    expect(a.pupil).toBe(0);
  });

  it("turns right for somebody on the right, and left for somebody on the left", () => {
    expect(attentionOf(1, 0).yaw).toBeGreaterThan(0);
    expect(attentionOf(-1, 0).yaw).toBeLessThan(0);
  });

  /**
   * La promessa del punto: **comunque sia girato il corpo**. Il collo è figlio
   * del corpo, quindi la stessa richiesta deve produrre angoli diversi a
   * seconda di dove è girato — ed è precisamente ciò che non faceva.
   */
  it("follows you no matter which way the body is turned", () => {
    // sei davanti a lui, e lui si è girato verso destra: deve guardare a
    // sinistra del proprio muso, cioè indietro verso di te
    const turnedRight = attentionOf(0, 1.2);
    expect(turnedRight.sees).toBe(true);
    expect(turnedRight.yaw).toBeLessThan(0);
    expect(turnedRight.pupil).toBeLessThan(0);

    const turnedLeft = attentionOf(0, -1.2);
    expect(turnedLeft.yaw).toBeGreaterThan(0);
    expect(turnedLeft.pupil).toBeGreaterThan(0);

    // e da girato bene, il collo è al fermo e il resto lo fanno gli occhi
    expect(Math.abs(turnedRight.yaw)).toBeCloseTo(NECK_LIMIT, 6);
  });

  it("gives the neck what it can hold and the eyes the rest", () => {
    const angle = NECK_LIMIT + PUPIL_SPAN * 0.5;
    const a = attentionOf(angle / VIEWER_SPREAD, 0);
    expect(a.yaw).toBeCloseTo(NECK_LIMIT, 6);
    expect(a.pupil).toBeCloseTo(0.5, 6);
  });

  it("never lets an eye leave its socket, whatever you ask", () => {
    for (let i = 0; i < 500; i += 1) {
      const a = attentionOf(Math.random() * 20 - 10, Math.random() * 14 - 7);
      expect(Math.abs(a.pupil)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.yaw)).toBeLessThanOrEqual(NECK_LIMIT);
      expect(Number.isFinite(a.yaw)).toBe(true);
    }
  });

  /**
   * Se sei dietro di lui non ti vede, e non deve fingere: pupille incollate al
   * bordo dell'occhio sono uno strabismo permanente, che legge come rotto
   * invece che come spento.
   */
  it("looks ahead when you are behind him, instead of straining", () => {
    const behind = attentionOf(0, Math.PI);
    expect(behind.sees).toBe(false);
    expect(behind.yaw).toBe(0);
    expect(behind.pupil).toBe(0);
    // e appena rientri nel suo campo torna a seguirti
    expect(attentionOf(0, OUT_OF_SIGHT - 0.1).sees).toBe(true);
  });

  it("looks ahead when there is nobody to look at", () => {
    expect(attentionOf(null, 0.7)).toEqual({ yaw: 0, pupil: 0, sees: false });
  });

  /** Un `NaN` che arriva dal rilevatore non deve piantare la testa altrove. */
  it("survives a detector that returns nonsense", () => {
    expect(attentionOf(Number.NaN, 0).sees).toBe(false);
    expect(attentionOf(0, Number.NaN).sees).toBe(false);
  });
});
