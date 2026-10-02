import { z } from "zod";
import type { VoiceProvider } from "./types.js";

/**
 * Da cosa si sceglie la voce (ADR-123). OpenAI ed ElevenLabs hanno pochi
 * modelli stabili e un elenco così corto si tiene qui; i modelli audio di
 * OpenRouter arrivano dal suo catalogo (`ModelCatalog`, modalità `audio`). Le
 * voci di ElevenLabs sono dell'account dell'utente, e si leggono con la sua
 * chiave.
 */

export type VoiceRole = "tts" | "stt";

export interface VoiceModel {
  provider: VoiceProvider;
  id: string;
  label: string;
}

export const VOICE_MODELS: Record<VoiceRole, VoiceModel[]> = {
  tts: [
    { provider: "openai", id: "gpt-4o-mini-tts", label: "OpenAI gpt-4o-mini-tts (col tono dell'umore)" },
    { provider: "openai", id: "tts-1", label: "OpenAI tts-1" },
    { provider: "openai", id: "tts-1-hd", label: "OpenAI tts-1-hd" },
    { provider: "elevenlabs", id: "eleven_flash_v2_5", label: "ElevenLabs Flash v2.5 (veloce)" },
    { provider: "elevenlabs", id: "eleven_multilingual_v2", label: "ElevenLabs Multilingual v2" },
  ],
  stt: [
    { provider: "openai", id: "gpt-4o-mini-transcribe", label: "OpenAI gpt-4o-mini-transcribe" },
    { provider: "openai", id: "gpt-4o-transcribe", label: "OpenAI gpt-4o-transcribe" },
    { provider: "openai", id: "whisper-1", label: "OpenAI whisper-1" },
    { provider: "elevenlabs", id: "scribe_v1", label: "ElevenLabs Scribe" },
  ],
};

export interface VoiceOption {
  id: string;
  label: string;
}

const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];
const OPENROUTER_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

const elevenVoicesSchema = z.object({
  voices: z.array(z.object({ voice_id: z.string(), name: z.string() })),
});

/** Le voci di un provider. ElevenLabs le legge dall'account di chi ha la chiave. */
export async function voicesFor(
  provider: VoiceProvider,
  apiKey: string | undefined,
  baseUrl?: string,
): Promise<VoiceOption[]> {
  if (provider === "openai") return OPENAI_VOICES.map((v) => ({ id: v, label: v }));
  if (provider === "openrouter") return OPENROUTER_VOICES.map((v) => ({ id: v, label: v }));
  if (apiKey === undefined) return [];
  const response = await fetch(new URL("/v1/voices", baseUrl ?? "https://api.elevenlabs.io"), {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`elevenlabs voices (status ${String(response.status)})`);
  const parsed = elevenVoicesSchema.parse(await response.json());
  return parsed.voices.map((v) => ({ id: v.voice_id, label: v.name }));
}
