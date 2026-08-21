import { describe, expect, it } from "vitest";
import { TAP_CHUNK, TAP_WORKLET_NAME, TAP_WORKLET_SOURCE } from "./tapWorklet.js";

/**
 * Il sorgente del worklet è una stringa, ma è codice: qui lo si ESEGUE con un
 * finto scope audio e gli si danno campioni coi numeri. Senza questo test la
 * stringa sarebbe l'unico pezzo del muso che nessuno prova mai.
 */

interface FakePort {
  posted: { data: Float32Array; transfer: Transferable[] | undefined }[];
}

interface TapProcessorLike {
  port: { postMessage: (data: Float32Array, transfer?: Transferable[]) => void };
  process: (inputs: Float32Array[][]) => boolean;
}

function instantiate(): { processor: TapProcessorLike; port: FakePort; registeredAs: string } {
  const port: FakePort = { posted: [] };
  class FakeAudioWorkletProcessor {
    public readonly port = {
      postMessage: (data: Float32Array, transfer?: Transferable[]): void => {
        port.posted.push({ data, transfer });
      },
    };
  }
  let registeredAs = "";
  let Registered: (new () => TapProcessorLike) | undefined;
  const registerProcessor = (name: string, ctor: new () => TapProcessorLike): void => {
    registeredAs = name;
    Registered = ctor;
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- eseguire la stringa È il test
  const run = new Function("AudioWorkletProcessor", "registerProcessor", TAP_WORKLET_SOURCE) as (
    base: unknown,
    register: (name: string, ctor: new () => TapProcessorLike) => void,
  ) => void;
  run(FakeAudioWorkletProcessor, registerProcessor);
  if (Registered === undefined) throw new Error("il worklet non si è registrato");
  return { processor: new Registered(), port, registeredAs };
}

/** Un quanto di rendering come lo consegna il browser: 128 campioni. */
function quantum(startValue: number, length = 128): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = startValue + i;
  return samples;
}

describe("il worklet della presa", () => {
  it("si registra col nome che il nodo cercherà", () => {
    expect(instantiate().registeredAs).toBe(TAP_WORKLET_NAME);
  });

  it("accumula i quanti da 128 e consegna blocchi interi da TAP_CHUNK", () => {
    const { processor, port } = instantiate();
    const rounds = TAP_CHUNK / 128;
    for (let i = 0; i < rounds - 1; i += 1) {
      expect(processor.process([[quantum(i * 128)]])).toBe(true);
      expect(port.posted).toHaveLength(0);
    }
    processor.process([[quantum((rounds - 1) * 128)]]);
    expect(port.posted).toHaveLength(1);
    const block = port.posted[0]?.data;
    expect(block).toHaveLength(TAP_CHUNK);
    // i campioni arrivano nell'ordine in cui sono stati detti
    expect(block?.[0]).toBe(0);
    expect(block?.[TAP_CHUNK - 1]).toBe(TAP_CHUNK - 1);
  });

  it("trasferisce il buffer invece di copiarlo", () => {
    const { processor, port } = instantiate();
    for (let i = 0; i < TAP_CHUNK / 128; i += 1) processor.process([[quantum(0)]]);
    const first = port.posted[0];
    expect(first?.transfer).toEqual([first?.data.buffer]);
  });

  it("un blocco più largo del residuo si spezza senza perdere campioni", () => {
    const { processor, port } = instantiate();
    // un quanto anomalo grande quanto un blocco e mezzo: il primo blocco esce
    // pieno e la coda resta ad aspettare il prossimo giro
    processor.process([[quantum(0, TAP_CHUNK + TAP_CHUNK / 2)]]);
    expect(port.posted).toHaveLength(1);
    processor.process([[quantum(TAP_CHUNK + TAP_CHUNK / 2, TAP_CHUNK / 2)]]);
    expect(port.posted).toHaveLength(2);
    expect(port.posted[1]?.data[0]).toBe(TAP_CHUNK);
    expect(port.posted[1]?.data[TAP_CHUNK - 1]).toBe(2 * TAP_CHUNK - 1);
  });

  it("senza canale in ingresso non fa niente e resta vivo", () => {
    const { processor, port } = instantiate();
    expect(processor.process([[]])).toBe(true);
    expect(processor.process([[new Float32Array(0)]])).toBe(true);
    expect(port.posted).toHaveLength(0);
  });
});
