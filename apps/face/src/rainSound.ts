import type { SkyState } from "./body/room3d.js";

/**
 * Il suono della pioggia (gruppo 13): quando fuori piove, nel recinto si
 * sente — piano.
 *
 * WebAudio procedurale, zero asset (ADR-026 §1): rumore bianco generato una
 * volta, filtrato in basso, a un volume che sta sotto qualunque voce. Le
 * regole che contano:
 *
 * - parte SOLO dopo che i sensi sono accesi: l'AudioContext vuole il gesto
 *   dell'utente, e comunque una pagina che suona da sola è una pagina che
 *   viene chiusa;
 * - di notte tace: la pioggia vera non sveglia nessuno attraverso i muri, e
 *   nemmeno questa deve;
 * - spegnere i sensi la spegne: un interruttore solo, quello che c'è già.
 */

const RAIN_GAIN = 0.035;
const RAIN_LOWPASS_HZ = 1100;

/** La decisione, pura: piove nel cielo, i sensi sono accesi, non è notte. */
export function rainShouldPlay(
  sky: Pick<SkyState, "mode" | "weather"> | undefined,
  sensesOn: boolean,
): boolean {
  if (!sensesOn || sky === undefined) return false;
  return sky.weather === "rain" && sky.mode !== "night";
}

export class RainSound {
  private context: AudioContext | undefined;
  private source: AudioBufferSourceNode | undefined;

  /** accende o spegne in base allo stato — idempotente, si chiama a ogni cielo */
  public update(sky: Pick<SkyState, "mode" | "weather"> | undefined, sensesOn: boolean): void {
    if (rainShouldPlay(sky, sensesOn)) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.source !== undefined) return;
    try {
      this.context ??= new AudioContext();
      const seconds = 2;
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * seconds,
        this.context.sampleRate,
      );
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = RAIN_LOWPASS_HZ;
      const gain = this.context.createGain();
      gain.gain.value = RAIN_GAIN;
      source.connect(filter).connect(gain).connect(this.context.destination);
      source.start();
      this.source = source;
    } catch {
      // niente WebAudio: la pioggia resta un fatto del cielo, non un guasto
    }
  }

  private stop(): void {
    try {
      this.source?.stop();
    } catch {
      // già fermo
    }
    this.source = undefined;
  }
}
