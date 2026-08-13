import { faceToServerSchema } from "@ugo/shared/face";
import { describe, expect, it } from "vitest";
import { TARGET_RATE, VoiceClip } from "./voiceClip.js";

/**
 * ADR-045, e il difetto che ha reso UGO muto.
 *
 * `VoiceClip` diceva nel commento «PCM int16 a **16 kHz**» e campionava invece
 * al ritmo dell'`AudioContext`, che su un dispositivo vero è 44,1 o 48 kHz. Tre
 * secondi a 48 kHz sono 288 000 byte, cioè 384 000 caratteri di base64, e il
 * contratto ne accetta 200 000: ogni frase con il microfono acceso veniva
 * **scartata dallo schema**, senza risposta e senza una riga di log. Il corpo
 * la scriveva comunque nel proprio registro, quindi si vedeva UGO sentire
 * tutto e non rispondere mai.
 *
 * Il test è sulla frase intera e non sulla lunghezza della stringa: ciò che
 * deve valere è che il frame **passi il contratto**, non che un numero stia
 * sotto un altro numero.
 */

const speech = (rate: number, seconds: number): Float32Array => {
  const samples = new Float32Array(Math.floor(rate * seconds));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.8;
  }
  return samples;
};

const filled = (rate: number, seconds = 5): VoiceClip => {
  const clip = new VoiceClip(rate);
  clip.push(speech(rate, seconds));
  return clip;
};

describe("VoiceClip", () => {
  // i ritmi che i browser consegnano davvero: nessuno di questi è 16 kHz
  it.each([16_000, 44_100, 48_000])("produces a frame the contract accepts at %i Hz", (rate) => {
    const audio = filled(rate).take();
    expect(audio).toBeDefined();
    const parsed = faceToServerSchema.safeParse({
      type: "heard_text",
      text: "Buongiorno Ugo",
      audio,
    });
    expect(parsed.success).toBe(true);
  });

  it.each([16_000, 44_100, 48_000])("resamples %i Hz down to what the recogniser wants", (rate) => {
    const audio = filled(rate).take() ?? "";
    // base64 → byte → campioni int16, e il conto deve tornare in secondi
    const bytes = (audio.length / 4) * 3 - (audio.endsWith("==") ? 2 : audio.endsWith("=") ? 1 : 0);
    const seconds = bytes / 2 / TARGET_RATE;
    expect(seconds).toBeCloseTo(3, 1);
  });

  it("stays silent until there is enough of it to identify anybody", () => {
    const clip = new VoiceClip(48_000);
    clip.push(speech(48_000, 0.5));
    expect(clip.take()).toBeUndefined();
  });

  it("forgets on demand — that is what makes 'il corpo non registra' true", () => {
    const clip = filled(48_000);
    expect(clip.take()).toBeDefined();
    clip.forget();
    expect(clip.take()).toBeUndefined();
  });

  it("keeps the sound recognisable through the resampling", () => {
    // un tono a 220 Hz resta un tono: se il ricampionamento sbagliasse il
    // passo, l'ampiezza collasserebbe e il riconoscitore riceverebbe silenzio
    const audio = filled(48_000).take() ?? "";
    const binary = atob(audio);
    let peak = 0;
    for (let i = 0; i + 1 < binary.length; i += 2) {
      const value = new DataView(
        Uint8Array.from([binary.charCodeAt(i), binary.charCodeAt(i + 1)]).buffer,
      ).getInt16(0, true);
      peak = Math.max(peak, Math.abs(value));
    }
    expect(peak).toBeGreaterThan(0.5 * 32_767);
  });
});
