/**
 * Il cancello degli enunciati (gruppo 4, la metà chiosco della dettatura).
 *
 * La dettatura locale non vuole un nastro: vuole UN enunciato per volta —
 * «da quando ha cominciato a parlare a quando ha smesso» — da mandare a
 * whisper. Questo cancello è la parte che decide dove comincia e dove
 * finisce, ed è PURA di proposito: campioni dentro, enunciati fuori, niente
 * browser — così si prova coi numeri, senza un microfono.
 *
 * Le misure sono relative al pavimento della stanza, non assolute: l'AGC e i
 * microfoni non calibrati rendono i dB assoluti bugiardi (ADR-029), quindi il
 * pavimento si impara con una media mobile e si apre solo su un salto sopra
 * di esso.
 *
 * I limiti parlano il contratto del server: `/v1/transcribe` vuole almeno
 * 0,8 s, il ponte `/v1/stt` accetta al massimo ~12 s di PCM a 16 kHz. Sotto
 * il minimo si butta (un colpo di tosse non è una frase), al massimo si
 * chiude d'ufficio.
 */

/** quanto sopra il pavimento (dB) per dire «sta parlando» */
const OPEN_DELTA_DB = 9;
/** sotto questo margine (dB) il suono è di nuovo stanza */
const CLOSE_DELTA_DB = 5;
/** silenzio continuo che chiude l'enunciato */
const HANG_MS = 700;
/** un attimo di stanza PRIMA dell'attacco, o la prima sillaba si mozza */
const PREROLL_MS = 300;
/** sotto, non è una frase (e il server risponderebbe 422) */
const MIN_UTTERANCE_MS = 900;
/** sopra, si chiude d'ufficio: il ponte accetta ~12 s */
const MAX_UTTERANCE_MS = 11_000;
/** il pavimento si impara piano: una frase non deve alzarlo */
const FLOOR_ALPHA = 0.02;

export class UtteranceGate {
  private floor = 40;
  private open = false;
  private openedAtMs = 0;
  private lastLoudAtMs = 0;
  private held: Float32Array[] = [];
  private heldSamples = 0;
  private readonly preroll: Float32Array[] = [];
  private prerollSamples = 0;

  public constructor(
    private readonly sampleRate: number,
    private readonly onVoice?: () => void,
  ) {}

  public isOpen(): boolean {
    return this.open;
  }

  /**
   * Un blocco di campioni dal microfono. Torna un enunciato completo quando
   * il cancello si richiude, `undefined` in tutti gli altri battiti.
   */
  public feed(samples: Float32Array, atMs: number): Float32Array | undefined {
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    const db = Math.max(0, 94 + 20 * Math.log10(rms + 1e-8));

    if (!this.open) {
      // il pavimento si impara solo a cancello chiuso: imparare mentre si
      // parla alzerebbe l'asticella fino a tagliare le frasi lunghe
      this.floor = this.floor * (1 - FLOOR_ALPHA) + db * FLOOR_ALPHA;
      this.pushPreroll(samples);
      if (db > this.floor + OPEN_DELTA_DB) {
        this.open = true;
        this.openedAtMs = atMs;
        this.lastLoudAtMs = atMs;
        this.held = [...this.preroll];
        this.heldSamples = this.prerollSamples;
        this.held.push(samples.slice());
        this.heldSamples += samples.length;
        this.onVoice?.();
      }
      return undefined;
    }

    this.held.push(samples.slice());
    this.heldSamples += samples.length;
    if (db > this.floor + CLOSE_DELTA_DB) this.lastLoudAtMs = atMs;

    const quietFor = atMs - this.lastLoudAtMs;
    const openFor = atMs - this.openedAtMs;
    if (quietFor < HANG_MS && openFor < MAX_UTTERANCE_MS) return undefined;
    // il minimo si misura sulla VOCE (dall'attacco all'ultimo suono), non sul
    // tempo a cancello aperto: quello include la coda di silenzio che chiude,
    // e farebbe passare un colpo di tosse da 300 ms come frase da un secondo
    return this.close(this.lastLoudAtMs - this.openedAtMs);
  }

  private close(loudForMs: number): Float32Array | undefined {
    this.open = false;
    const pieces = this.held;
    this.held = [];
    const total = this.heldSamples;
    this.heldSamples = 0;
    this.preroll.length = 0;
    this.prerollSamples = 0;
    if (loudForMs < MIN_UTTERANCE_MS) return undefined;
    const utterance = new Float32Array(total);
    let cursor = 0;
    for (const piece of pieces) {
      utterance.set(piece, cursor);
      cursor += piece.length;
    }
    return utterance;
  }

  private pushPreroll(samples: Float32Array): void {
    this.preroll.push(samples.slice());
    this.prerollSamples += samples.length;
    const cap = Math.ceil((PREROLL_MS / 1000) * this.sampleRate);
    while (this.prerollSamples - (this.preroll[0]?.length ?? 0) >= cap && this.preroll.length > 1) {
      const dropped = this.preroll.shift();
      this.prerollSamples -= dropped?.length ?? 0;
    }
  }
}
