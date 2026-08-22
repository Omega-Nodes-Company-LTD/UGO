import type { Traits } from "./pig.js";

/**
 * Il verso (ADR-116): il grugnito smette di essere solo un gesto visivo.
 *
 * Fino a qui `grunt` muoveva bocca, orecchie e una scossa, e non faceva
 * rumore. È stata la scelta giusta finché non c'era una regola su **quando**
 * un verso può suonare — una pagina che grugnisce da sola è una pagina che
 * viene chiusa — e qui la regola c'è, ed è quella della pioggia (gruppo 13),
 * perché il problema è lo stesso.
 *
 * ## Il timbro viene dal genoma, e NON è un gene nuovo
 *
 * `chonk` e `snout` bastano, quindi zero migrazioni e zero manopole: **un
 * maiale grosso suona più basso**, e **un grugno lungo suona più scuro** — la
 * fisica di una cassa di risonanza, non un'impostazione. Due gosini della
 * stessa cucciolata hanno versi diversi perché hanno corpi diversi, che è
 * esattamente come si eredita tutto il resto (regola 13: si adotta, non si
 * configura).
 *
 * ## Il grugnito NON è la voce
 *
 * UGO parla col sintetizzatore. Il grugnito è un verso, e i due non si
 * sovrappongono mai: mentre parla non grugnisce. Un verso sopra una frase non
 * è espressività, è una frase che non si capisce.
 */

/** I due estremi del verso, in hertz: un cucciolo magro e un maiale enorme. */
const PITCH_HIGH_HZ = 190;
const PITCH_LOW_HZ = 72;

/** Il filtro: quanto è chiuso il timbro. Un grugno lungo scurisce. */
const TIMBRE_BRIGHT_HZ = 1400;
const TIMBRE_DARK_HZ = 520;

/** Quanto dura un grugnito. Corto: è un verso, non un lamento. */
const GRUNT_MS = 190;

/** Sotto qualunque voce, come la pioggia: un verso non deve coprire una frase. */
const GRUNT_GAIN = 0.09;

export interface GruntVoice {
  /** la fondamentale, in hertz */
  pitchHz: number;
  /** dove taglia il filtro: il colore del verso */
  timbreHz: number;
  lengthMs: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Il verso di questo corpo. Puro e deterministico: **stesso genoma, stesso
 * verso**, come per il manto e la coda — se cambiasse a ogni ricarica non
 * sarebbe un tratto, sarebbe un effetto.
 */
export function gruntVoice(traits: Pick<Traits, "chonk" | "snout">): GruntVoice {
  return {
    pitchHz: lerp(PITCH_HIGH_HZ, PITCH_LOW_HZ, traits.chonk),
    timbreHz: lerp(TIMBRE_BRIGHT_HZ, TIMBRE_DARK_HZ, traits.snout),
    lengthMs: GRUNT_MS,
  };
}

/** Quando un verso può suonare. Puro, perché è la parte che si sbaglia. */
export function gruntShouldSound(input: {
  sensesOn: boolean;
  night: boolean;
  speaking: boolean;
}): boolean {
  if (!input.sensesOn) return false;
  // di notte tace, come la pioggia: un verso attraverso il buio è una sveglia
  if (input.night) return false;
  // mentre parla, mai: un verso sopra una frase è una frase che non si capisce
  return !input.speaking;
}

/**
 * Il verso, sintetizzato: nessun asset (ADR-026 §1).
 *
 * Un'onda a dente di sega che scende di un semitono e mezzo in meno di un
 * quinto di secondo, filtrata in basso. Non imita un maiale vero e non ci
 * prova: deve suonare come **quel** corpo, e bastano due parametri per farlo.
 */
export class GruntSound {
  private context: AudioContext | undefined;

  public play(voice: GruntVoice): void {
    try {
      this.context ??= new AudioContext();
      const ctx = this.context;
      const now = ctx.currentTime;
      const seconds = voice.lengthMs / 1000;

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(voice.pitchHz, now);
      osc.frequency.exponentialRampToValueAtTime(voice.pitchHz * 0.88, now + seconds);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = voice.timbreHz;

      const gain = ctx.createGain();
      // attacco corto e coda breve: senza inviluppo si sente un «clic», che è
      // il rumore dell'altoparlante e non del maiale
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(GRUNT_GAIN, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + seconds + 0.02);
    } catch {
      // niente AudioContext (gesto non ancora dato, o dispositivo senza audio):
      // il gesto visivo resta e basta, che è com'era prima
    }
  }
}
