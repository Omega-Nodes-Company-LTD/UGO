/**
 * L'emozione dal tono di voce (gruppo 13) — versione 1: prosodia, non
 * psicologia.
 *
 * Il clip di ~3 secondi viaggia GIÀ con ogni frase (ADR-045: PCM int16 a
 * 16 kHz, per il riconoscimento del parlante). Qui se ne misura il TONO con
 * pura aritmetica — niente modelli, niente rete, niente costi:
 *
 * - il **ritmo**: quante sillabe al secondo (picchi dell'inviluppo di
 *   energia) — chi è acceso parla fitto, chi è quieto lascia spazi;
 * - la **variabilità del pitch**: quanto la voce si muove attorno alla sua
 *   frequenza (autocorrelazione, 75-400 Hz) — la voce agitata ondeggia, la
 *   voce calma sta ferma.
 *
 * Tutte misure RELATIVE al clip stesso, mai assolute: il microfono di un
 * telefono ha l'AGC e il volume assoluto non significa niente (la lezione di
 * ADR-029). La classificazione è volutamente grossolana — «acceso», «quieto»,
 * o niente — perché un segnale rozzo onesto vale più di una diagnosi finta:
 * la versione coi modelli veri arriverà con la GPU.
 */

export type VoiceTone = "acceso" | "quieto";

const SAMPLE_RATE = 16_000;
const FRAME = 512; // 32 ms
const HOP = 256; // 16 ms
/** la banda del parlato umano; fuori è rumore o armonica */
const PITCH_MIN_HZ = 75;
const PITCH_MAX_HZ = 400;

/** le soglie, dichiarate: tarate sui casi sintetici dei test, da rifinire
 * con voci vere — il numero giusto lo dà la casa, non il laboratorio */
const EXCITED_RATE_PER_S = 4.5;
const EXCITED_PITCH_CV = 0.22;
const CALM_RATE_PER_S = 2.8;
const CALM_PITCH_CV = 0.1;
/** sotto questa frazione di quadri parlati il clip non dice niente di nessuno */
const MIN_VOICED_FRACTION = 0.15;

interface Features {
  syllablesPerSecond: number;
  pitchCv: number;
  voicedFraction: number;
}

function rms(samples: Float32Array, start: number): number {
  let sum = 0;
  for (let i = start; i < start + FRAME && i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / FRAME);
}

/** il pitch di un quadro via autocorrelazione normalizzata, o 0 se sordo */
function framePitch(samples: Float32Array, start: number): number {
  const minLag = Math.floor(SAMPLE_RATE / PITCH_MAX_HZ);
  const maxLag = Math.ceil(SAMPLE_RATE / PITCH_MIN_HZ);
  let energy = 0;
  for (let i = 0; i < FRAME; i += 1) {
    const v = samples[start + i] ?? 0;
    energy += v * v;
  }
  if (energy === 0) return 0;
  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    for (let i = 0; i < FRAME - lag; i += 1) {
      corr += (samples[start + i] ?? 0) * (samples[start + i + lag] ?? 0);
    }
    corr /= energy;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  // sotto 0.5 la periodicità è debole: rumore, fricative, silenzio
  return bestCorr > 0.5 && bestLag > 0 ? SAMPLE_RATE / bestLag : 0;
}

export function featuresOf(pcm: Int16Array): Features {
  const samples = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) samples[i] = (pcm[i] ?? 0) / 32768;

  const energies: number[] = [];
  const pitches: number[] = [];
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    energies.push(rms(samples, start));
  }
  const peakEnergy = Math.max(...energies, 1e-9);
  // «parlato» è relativo al clip: un quinto del suo stesso massimo, non un
  // numero assoluto — l'AGC rende i numeri assoluti bugiardi
  const voicedThreshold = peakEnergy * 0.2;
  let voiced = 0;
  for (let frame = 0; frame < energies.length; frame += 1) {
    if ((energies[frame] ?? 0) > voicedThreshold) {
      voiced += 1;
      pitches.push(framePitch(samples, frame * HOP));
    }
  }
  const voicedFraction = energies.length === 0 ? 0 : voiced / energies.length;

  // le sillabe: picchi dell'inviluppo, ad almeno ~100 ms l'uno dall'altro
  let syllables = 0;
  let lastPeak = -10;
  for (let i = 1; i < energies.length - 1; i += 1) {
    const here = energies[i] ?? 0;
    if (
      here > voicedThreshold &&
      here >= (energies[i - 1] ?? 0) &&
      here > (energies[i + 1] ?? 0) &&
      i - lastPeak >= 5
    ) {
      syllables += 1;
      lastPeak = i;
    }
  }
  // sull'OROLOGIO, non sui soli quadri parlati: chi è quieto lascia spazi, e
  // contare il ritmo solo dentro le sillabe cancellerebbe proprio gli spazi —
  // che sono metà dell'informazione
  const clipSeconds = pcm.length / SAMPLE_RATE;
  const syllablesPerSecond = clipSeconds > 0 ? syllables / clipSeconds : 0;

  const tuned = pitches.filter((p) => p > 0);
  let pitchCv = 0;
  if (tuned.length >= 5) {
    const mean = tuned.reduce((a, b) => a + b, 0) / tuned.length;
    const variance = tuned.reduce((a, b) => a + (b - mean) * (b - mean), 0) / tuned.length;
    pitchCv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  }
  return { syllablesPerSecond, pitchCv, voicedFraction };
}

/** Il verdetto — o niente: il neutro non è un evento, è la normalità. */
export function toneOf(pcm: Int16Array): VoiceTone | undefined {
  if (pcm.length < SAMPLE_RATE / 2) return undefined; // sotto mezzo secondo non è una frase
  const f = featuresOf(pcm);
  if (f.voicedFraction < MIN_VOICED_FRACTION) return undefined;
  if (
    f.syllablesPerSecond >= EXCITED_RATE_PER_S ||
    (f.pitchCv >= EXCITED_PITCH_CV && f.syllablesPerSecond > 3.2)
  ) {
    return "acceso";
  }
  if (f.syllablesPerSecond <= CALM_RATE_PER_S && f.pitchCv <= CALM_PITCH_CV) return "quieto";
  return undefined;
}

/** Dal filo: il base64 del frame `heard_text`, com'è (PCM int16 LE, 16 kHz). */
export function toneOfBase64(audio: string): VoiceTone | undefined {
  try {
    const raw = Buffer.from(audio, "base64");
    return toneOf(new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2)));
  } catch {
    return undefined; // un clip storto non deve mai rompere la frase
  }
}
