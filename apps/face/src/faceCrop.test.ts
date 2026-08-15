import { describe, expect, it } from "vitest";
import { CROP_SIDE } from "./faceCrop.js";

/**
 * ADR-052. Il ritaglio vero ha bisogno di un `<canvas>` e di un `<video>`, che
 * in node non ci sono: quel che si può provare qui senza fingere un browser è
 * il **contratto**, ed è anche la parte che rompendosi non fa rumore.
 *
 * `decode_face` in `ops/voice/app.py` rifiuta qualunque cosa non sia esattamente
 * 112·112·3 byte. Il giorno che qualcuno «ottimizzasse» il lato a 96, il muso
 * spedirebbe felicemente e il servizio risponderebbe 422 a ogni volto — un
 * riconoscimento che smette di funzionare senza un solo errore in vista, che è
 * la famiglia di difetti che questa sessione ha già pagato due volte.
 */
describe("il ritaglio del volto", () => {
  it("keeps the side the encoder's contract demands", () => {
    expect(CROP_SIDE).toBe(112);
  });

  it("fits inside the wire cap, with the margin the contract says", () => {
    // 112·112·3 = 37 632 byte → 50 176 caratteri di base64. Il tetto sul filo è
    // 56 000: se il lato cresce, questo diventa rosso prima del deploy.
    const bytes = CROP_SIDE * CROP_SIDE * 3;
    const base64 = Math.ceil(bytes / 3) * 4;
    expect(base64).toBeLessThan(56_000);
  });
});
