/**
 * La voce dei provider (ADR-123): sintesi e trascrizione.
 *
 * Come per il testo, gli adapter traducono e basta; tetto, credito e ledger
 * sono del cancello (`gate.ts`). Lanciano SOLO prima di un 2xx: dopo, la
 * chiamata è pagata e si restituisce quello che c'è.
 */

export type VoiceProvider = "openai" | "elevenlabs" | "openrouter";

export interface Speech {
  audio: Buffer;
  /** `audio/mpeg` o `audio/wav`: il muso li suona entrambi */
  mime: string;
  /** quanto è costata secondo il provider, quando lo dice (OpenRouter) */
  providerCostUsd?: number;
}

export interface SpeechAdapter {
  readonly provider: VoiceProvider;
  readonly model: string;
  synth(text: string, options: { voice: string; instructions?: string }): Promise<Speech>;
}

export interface Transcript {
  text: string;
  providerCostUsd?: number;
}

export interface TranscribeAdapter {
  readonly provider: VoiceProvider;
  readonly model: string;
  /** `wav`: l'enunciato, già incapsulato (PCM16 mono) */
  transcribe(wav: Buffer): Promise<Transcript>;
}
