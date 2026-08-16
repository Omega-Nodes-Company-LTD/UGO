import { describe, expect, it } from "vitest";
import { UtteranceGate } from "./utteranceGate.js";

/**
 * Il cancello degli enunciati (gruppo 4): puro, quindi si prova coi numeri.
 * Frame sintetici da 20 ms: la stanza è quasi silenzio, la voce è un tono
 * pieno — quello che conta è il salto relativo, non i valori assoluti.
 */

const RATE = 16_000;
const FRAME = Math.round(RATE * 0.02);

function frame(amplitude: number): Float32Array {
  const samples = new Float32Array(FRAME);
  for (let index = 0; index < FRAME; index += 1) {
    samples[index] = amplitude * Math.sin((index / FRAME) * Math.PI * 40);
  }
  return samples;
}

/** dà da mangiare `ms` di stanza o di voce, e raccoglie ciò che esce */
function feed(
  gate: UtteranceGate,
  amplitude: number,
  ms: number,
  clock: { now: number },
): Float32Array[] {
  const out: Float32Array[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += 20) {
    clock.now += 20;
    const utterance = gate.feed(frame(amplitude), clock.now);
    if (utterance !== undefined) out.push(utterance);
  }
  return out;
}

const ROOM = 0.003;
const VOICE = 0.25;

describe("UtteranceGate", () => {
  it("una frase si apre sulla voce e si chiude sul silenzio, col preroll davanti", () => {
    const clock = { now: 0 };
    const gate = new UtteranceGate(RATE);
    feed(gate, ROOM, 2000, clock); // la stanza insegna il pavimento
    expect(gate.isOpen()).toBe(false);
    const during = feed(gate, VOICE, 1500, clock);
    expect(during).toHaveLength(0); // mentre parla non esce niente
    expect(gate.isOpen()).toBe(true);
    const after = feed(gate, ROOM, 1500, clock);
    expect(after).toHaveLength(1);
    // 1,5 s di voce + preroll + la coda di silenzio prima della chiusura:
    // comunque ben più della voce nuda, e ben meno del nastro intero
    const seconds = (after[0]?.length ?? 0) / RATE;
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(3.5);
    expect(gate.isOpen()).toBe(false);
  });

  it("un colpo di tosse (sotto il minimo) non è una frase", () => {
    const clock = { now: 0 };
    const gate = new UtteranceGate(RATE);
    feed(gate, ROOM, 2000, clock);
    feed(gate, VOICE, 300, clock);
    const after = feed(gate, ROOM, 1500, clock);
    expect(after).toHaveLength(0);
  });

  it("un monologo si chiude d'ufficio al tetto, senza aspettare il silenzio", () => {
    const clock = { now: 0 };
    const gate = new UtteranceGate(RATE);
    feed(gate, ROOM, 2000, clock);
    const during = feed(gate, VOICE, 14_000, clock);
    expect(during).toHaveLength(1);
    // e il cancello è pronto per la frase dopo
    feed(gate, VOICE, 1200, clock);
    const after = feed(gate, ROOM, 1500, clock);
    expect(after).toHaveLength(1);
  });

  it("la stanza da sola non apre mai", () => {
    const clock = { now: 0 };
    const gate = new UtteranceGate(RATE);
    const out = feed(gate, ROOM, 10_000, clock);
    expect(out).toHaveLength(0);
    expect(gate.isOpen()).toBe(false);
  });

  it("avvisa che c'è una voce (per il misuratore di rumore, ADR-041)", () => {
    const clock = { now: 0 };
    let voices = 0;
    const gate = new UtteranceGate(RATE, () => {
      voices += 1;
    });
    feed(gate, ROOM, 2000, clock);
    feed(gate, VOICE, 1200, clock);
    feed(gate, ROOM, 1500, clock);
    expect(voices).toBe(1);
  });
});
