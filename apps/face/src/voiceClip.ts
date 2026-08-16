/**
 * Gli ultimi secondi di stanza, sempre pronti (ADR-045).
 *
 * Il problema di tempi: il riconoscitore del browser consegna il testo **dopo**
 * che la frase è finita. Se in quel momento cominciassimo a registrare
 * avremmo il silenzio successivo, non la voce che ha parlato. Quindi il corpo
 * tiene un anello circolare che gira sempre, e quando arriva il testo prende
 * indietro i secondi appena passati — che è dove sta la frase.
 *
 * Un anello e non un file che cresce: **niente si accumula.** Quello che c'è
 * dentro è sempre e solo la finestra corrente, e il resto è già stato
 * sovrascritto. Non è un dettaglio di efficienza — è ciò che rende vero dire
 * che il corpo non registra la stanza (ADR-016).
 */

/** Quanto indietro si può guardare. Più che sufficiente per identificare. */
const WINDOW_SECONDS = 5;

/** ECAPA vuole almeno un secondo: sotto, l'embedding è rumore. */
const MIN_SECONDS = 1;

/** Quanto se ne manda: il parlato utile sta in fondo alla finestra. */
const CLIP_SECONDS = 3;

/**
 * Il ritmo a cui parla tutto il resto del sistema: `ops/voice/app.py`,
 * `voice.py` e `ingest.py` dichiarano tutti `SAMPLE_RATE = 16_000`.
 *
 * Il microfono no: un `AudioContext` consegna il ritmo del dispositivo, che è
 * 44,1 o 48 kHz praticamente ovunque. Questo file **diceva** 16 kHz in un
 * commento e spediva il ritmo nativo, e le due cose insieme facevano due
 * danni: tre secondi a 48 kHz sono 384 000 caratteri di base64 contro i
 * 200 000 che il contratto accetta — quindi ogni frase col microfono acceso
 * veniva scartata in silenzio e UGO non rispondeva — e, quando invece ci
 * stava, il riconoscitore leggeva un 48 kHz come se fosse 16 kHz, cioè una
 * voce tre volte più lenta di quella che aveva parlato.
 */
export const TARGET_RATE = 16_000;

export class VoiceClip {
  private readonly ring: Float32Array;
  private written = 0;

  public constructor(private readonly sampleRate: number) {
    this.ring = new Float32Array(Math.ceil(sampleRate * WINDOW_SECONDS));
  }

  /** Un blocco di campioni dal microfono. Sovrascrive i più vecchi. */
  public push(samples: Float32Array): void {
    const size = this.ring.length;
    for (const sample of samples) {
      this.ring[this.written % size] = sample;
      this.written += 1;
    }
  }

  /**
   * Gli ultimi `CLIP_SECONDS`, come PCM int16 a 16 kHz in base64.
   *
   * `undefined` quando non c'è ancora abbastanza roba: mandare mezzo secondo
   * di stanza a un riconoscitore significa chiedergli di indovinare, che è
   * esattamente ciò che non deve fare.
   */
  public take(): string | undefined {
    const wanted = Math.floor(this.sampleRate * CLIP_SECONDS);
    const have = Math.min(this.written, this.ring.length);
    if (have < this.sampleRate * MIN_SECONDS) return undefined;

    const count = Math.min(wanted, have);
    const start = this.written - count;
    const flat = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      flat[index] = this.ring[(start + index) % this.ring.length] ?? 0;
    }
    return toPcm16Base64(flat, this.sampleRate);
  }

  /** Butta via la finestra: privacy mode, orecchie spente, cambio di stanza. */
  public forget(): void {
    this.ring.fill(0);
    this.written = 0;
  }
}

/**
 * Campioni al ritmo del microfono → PCM int16 a 16 kHz in base64: la lingua
 * che parlano `ops/voice/app.py` e il contratto del muso. Condivisa fra il
 * ritaglio dell'identità (`VoiceClip`) e gli enunciati della dettatura locale
 * (`utteranceGate`): la matematica del ricampionamento deve essere UNA, o i
 * due percorsi divergono in silenzio.
 */
export function toPcm16Base64(samples: Float32Array, fromRate: number): string {
  const count = samples.length;
  // gli stessi secondi, contati a 16 kHz invece che al ritmo del microfono
  const outCount = Math.max(1, Math.round((count * TARGET_RATE) / fromRate));
  const pcm = new Int16Array(outCount);
  for (let out = 0; out < outCount; out += 1) {
    // media della finestra sorgente, non il campione più vicino: scegliere
    // e basta lascia entrare come voce l'alias di ciò che sta sopra gli
    // 8 kHz, e la media fa da passa-basso povero ma onesto
    const from = Math.floor((out * count) / outCount);
    const to = Math.max(from + 1, Math.floor(((out + 1) * count) / outCount));
    let sum = 0;
    for (let index = from; index < to; index += 1) sum += samples[index] ?? 0;
    // clamp prima di scalare: un microfono che satura non deve produrre
    // campioni che avvolgono e suonano come un'altra voce
    const clamped = Math.max(-1, Math.min(1, sum / (to - from)));
    pcm[out] = Math.round(clamped * 32_767);
  }
  return base64Of(new Uint8Array(pcm.buffer));
}

/** `btoa` vuole una stringa binaria, e a blocchi, o esplode sui buffer grossi. */
function base64Of(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8_192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
