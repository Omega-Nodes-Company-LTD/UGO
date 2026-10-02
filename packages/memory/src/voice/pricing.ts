import type { VoiceProvider } from "./types.js";

/**
 * Listino della voce (ADR-123), in USD. **Stime dichiarate**: OpenAI prezza
 * l'audio in token, ElevenLabs a crediti di piano. Meglio sovrastimare di poco
 * che scoprire a fine mese che il salvadanaio mentiva; la riga del ledger porta
 * `cost_source = list`, e dove il provider dice il conto (OpenRouter) vale lui.
 */

const PER_CHAR: Record<string, number> = {
  "openai:gpt-4o-mini-tts": 12e-6,
  "openai:tts-1": 15e-6,
  "openai:tts-1-hd": 30e-6,
  "elevenlabs:eleven_flash_v2_5": 50e-6,
  "elevenlabs:eleven_turbo_v2_5": 50e-6,
  "elevenlabs:eleven_multilingual_v2": 100e-6,
  "elevenlabs:eleven_v3": 100e-6,
};

const PER_SECOND: Record<string, number> = {
  "openai:whisper-1": 100e-6,
  "openai:gpt-4o-transcribe": 100e-6,
  "openai:gpt-4o-mini-transcribe": 50e-6,
  "elevenlabs:scribe_v1": 110e-6,
};

/** il più caro noto, per un modello che non conosciamo: il tetto morde lo stesso */
const WORST_PER_CHAR = Math.max(...Object.values(PER_CHAR));
const WORST_PER_SECOND = Math.max(...Object.values(PER_SECOND));

export function speechCostUsd(provider: VoiceProvider, model: string, chars: number): {
  usd: number;
  known: boolean;
} {
  const rate = PER_CHAR[`${provider}:${model}`];
  return { usd: chars * (rate ?? WORST_PER_CHAR), known: rate !== undefined };
}

export function transcribeCostUsd(provider: VoiceProvider, model: string, seconds: number): {
  usd: number;
  known: boolean;
} {
  const rate = PER_SECOND[`${provider}:${model}`];
  return { usd: seconds * (rate ?? WORST_PER_SECOND), known: rate !== undefined };
}
