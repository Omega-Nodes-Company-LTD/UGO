import {
  ElevenLabsSpeech,
  ElevenLabsTranscribe,
  gatedSpeech,
  gatedTranscript,
  OpenAiSpeech,
  OpenAiTranscribe,
  OpenRouterSpeech,
  OpenRouterTranscribe,
  pcm16ToWav,
  type HeardOutcome,
  type ProviderBaseUrls,
  type Speech,
  type SpeechAdapter,
  type TranscribeAdapter,
} from "@ugo/memory";
import type { RoleChoice } from "./choices.js";
import type { AiResolver } from "./resolver.js";

/**
 * La voce della casa (ADR-123): i ruoli `tts` e `stt`, risolti come quelli di
 * testo e passati dallo stesso cancello. Se la casa non ha scelto, la
 * risposta è «nessuna voce» e il muso usa quella del browser — come ha sempre
 * fatto a ogni guasto.
 */

function speechAdapter(choice: RoleChoice, apiKey: string, urls: ProviderBaseUrls): SpeechAdapter | undefined {
  const common = { apiKey, model: choice.model };
  if (choice.provider === "openai") return new OpenAiSpeech({ ...common, ...(urls.openai !== undefined && { baseUrl: urls.openai }) });
  if (choice.provider === "elevenlabs") {
    return new ElevenLabsSpeech({ ...common, ...(urls.elevenlabs !== undefined && { baseUrl: urls.elevenlabs }) });
  }
  if (choice.provider === "openrouter") {
    return new OpenRouterSpeech({ ...common, ...(urls.openrouter !== undefined && { baseUrl: urls.openrouter }) });
  }
  return undefined;
}

function transcribeAdapter(choice: RoleChoice, apiKey: string, urls: ProviderBaseUrls): TranscribeAdapter | undefined {
  const common = { apiKey, model: choice.model };
  if (choice.provider === "openai") {
    return new OpenAiTranscribe({ ...common, ...(urls.openai !== undefined && { baseUrl: urls.openai }) });
  }
  if (choice.provider === "elevenlabs") {
    return new ElevenLabsTranscribe({ ...common, ...(urls.elevenlabs !== undefined && { baseUrl: urls.elevenlabs }) });
  }
  if (choice.provider === "openrouter") {
    return new OpenRouterTranscribe({ ...common, ...(urls.openrouter !== undefined && { baseUrl: urls.openrouter }) });
  }
  return undefined;
}

/** La sintesi di una frase con la voce della casa, o `undefined` (→ browser). */
export async function speak(
  ai: AiResolver,
  who: { accountId: string; gosinoId: string },
  text: string,
  instructions: string,
): Promise<Speech | undefined> {
  const found = await ai.keyed(who.accountId, "tts");
  if (found === undefined) return undefined;
  const adapter = speechAdapter(found.choice, found.apiKey, ai.baseUrls);
  if (adapter === undefined) return undefined;
  return gatedSpeech(ai.gateFor(who.accountId, who.gosinoId, found.timezone, found.choice), adapter, text, {
    voice: found.choice.voice ?? "alloy",
    instructions,
  });
}

/**
 * L'enunciato del muso (PCM16 a 16 kHz in base64) trascritto con le orecchie
 * della casa. `undefined` = la casa non ha scelto: il muso resta sul browser.
 */
export async function hear(
  ai: AiResolver,
  who: { accountId: string; gosinoId: string },
  pcmBase64: string,
): Promise<HeardOutcome | undefined> {
  const found = await ai.keyed(who.accountId, "stt");
  if (found === undefined) return undefined;
  const adapter = transcribeAdapter(found.choice, found.apiKey, ai.baseUrls);
  if (adapter === undefined) return undefined;
  // l'audio non si salva da nessuna parte: vive il tempo di questa chiamata
  const wav = pcm16ToWav(Buffer.from(pcmBase64, "base64"));
  return gatedTranscript(ai.gateFor(who.accountId, who.gosinoId, found.timezone, found.choice), adapter, wav);
}
