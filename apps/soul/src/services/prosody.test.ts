import { describe, expect, it } from "vitest";
import { toneOf, toneOfBase64 } from "./prosody.js";

/**
 * La prosodia, provata su voci sintetiche: una «voce» accesa (sillabe fitte,
 * pitch che ondeggia) e una quieta (lenta, pitch fermo), costruite con la
 * stessa aritmetica che il classificatore misura. Non è un corpus di voci
 * vere — quello è il banco, con le persone — ma prova le proprietà che
 * contano: le due classi si separano, il silenzio non dice niente, e il
 * volume assoluto NON conta (l'AGC del telefono è la lezione di ADR-029).
 */

const RATE = 16_000;

/** una "voce": portante a pitch variabile, modulata a sillabe */
function voice(seconds: number, syllablesPerSecond: number, pitchWobble: number): Int16Array {
  const out = new Int16Array(Math.floor(seconds * RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE;
    // il pitch ondeggia attorno a 140 Hz: wobble 0 = fermo, 0.4 = agitato
    const pitch = 140 * (1 + pitchWobble * Math.sin(2 * Math.PI * 1.7 * t));
    phase += (2 * Math.PI * pitch) / RATE;
    // le sillabe: inviluppo che pulsa, con pause vere fra un picco e l'altro
    const syllable = Math.max(0, Math.sin(2 * Math.PI * syllablesPerSecond * t)) ** 2;
    out[i] = Math.round(20_000 * syllable * Math.sin(phase));
  }
  return out;
}

describe("il tono della voce", () => {
  it("una voce fitta e ondeggiante è «accesa», una lenta e ferma è «quieta»", () => {
    expect(toneOf(voice(3, 6, 0.35))).toBe("acceso");
    expect(toneOf(voice(3, 1.8, 0.02))).toBe("quieto");
  });

  it("il volume assoluto non conta: la stessa voce a un decimo dà lo stesso verdetto", () => {
    const loud = voice(3, 6, 0.35);
    const soft = new Int16Array(loud.length);
    for (let i = 0; i < loud.length; i += 1) soft[i] = Math.round((loud[i] ?? 0) / 10);
    expect(toneOf(soft)).toBe(toneOf(loud));
  });

  it("il silenzio e i clip troppo corti non dicono niente di nessuno", () => {
    expect(toneOf(new Int16Array(3 * RATE))).toBeUndefined();
    expect(toneOf(voice(0.3, 6, 0.35))).toBeUndefined();
  });

  it("dal filo: il base64 si decodifica, e un base64 storto non rompe la frase", () => {
    const pcm = voice(3, 6, 0.35);
    const b64 = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString("base64");
    expect(toneOfBase64(b64)).toBe("acceso");
    expect(toneOfBase64("non-e-base64!!!")).toBeUndefined();
  });
});
