/**
 * La presa contigua sul microfono, lato worklet (gruppo 4).
 *
 * Il nastro per la dettatura locale passava da uno `ScriptProcessorNode`,
 * deprecato e — peggio della deprecazione — eseguito sul thread principale:
 * ogni blocco di campioni contendeva il tempo al renderer del muso, e un
 * frame perso lì è un pezzo di frase perso per whisper. `AudioWorklet` gira
 * sul thread audio, che è il posto dove i campioni nascono.
 *
 * Il modulo del worklet DEVE essere un file servito a parte — è il motivo per
 * cui la migrazione era stata rimandata. La risposta è non servirlo affatto:
 * il sorgente vive qui come stringa, diventa un Blob URL al momento del
 * montaggio, e il bundler non deve saperne niente. Niente asset da copiare,
 * niente percorso da azzeccare dietro il proxy di soul.
 *
 * La stringa è codice vero e si prova come tale: il test la esegue con un
 * finto `AudioWorkletProcessor` e le dà campioni coi numeri — senza browser,
 * come vuole la regola Zero-Mock per le funzioni pure.
 */

export const TAP_WORKLET_NAME = "ugo-tap";

/**
 * Stessa misura dei blocchi che consegnava `createScriptProcessor(4096, …)`:
 * il cancello degli enunciati ragiona sul ritmo di arrivo dei blocchi
 * (~85 ms a 48 kHz), e il worklet da solo renderebbe quanti di 128 campioni —
 * 375 messaggi al secondo per il piacere di farli.
 */
export const TAP_CHUNK = 4096;

/**
 * Dentro il worklet non c'è TypeScript né import: solo i globali dello scope
 * audio (`AudioWorkletProcessor`, `registerProcessor`). Il buffer pieno viaggia
 * TRASFERITO, non copiato: passata la proprietà, se ne alloca uno nuovo.
 */
export const TAP_WORKLET_SOURCE = `
class UgoTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(${String(TAP_CHUNK)});
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel === undefined || channel.length === 0) return true;
    let cursor = 0;
    while (cursor < channel.length) {
      const take = Math.min(channel.length - cursor, ${String(TAP_CHUNK)} - this.filled);
      this.chunk.set(channel.subarray(cursor, cursor + take), this.filled);
      this.filled += take;
      cursor += take;
      if (this.filled === ${String(TAP_CHUNK)}) {
        this.port.postMessage(this.chunk, [this.chunk.buffer]);
        this.chunk = new Float32Array(${String(TAP_CHUNK)});
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("${TAP_WORKLET_NAME}", UgoTapProcessor);
`;
