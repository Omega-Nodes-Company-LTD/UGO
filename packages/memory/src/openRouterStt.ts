import { PRIME_ACCOUNT_ID, PRIME_GOSINO_ID, type DbClient } from "@ugo/db";
import { z } from "zod";
import { OPENROUTER_URL } from "./chatRequest.js";
import { recordSpend } from "./ledger.js";
import { pcm16ToWav } from "./wav.js";

/**
 * La dettatura via OpenRouter (ADR-131), al posto di whisper sul servizio di
 * percezione. Il modello lo serve solo OpenAI, che NON offre conservazione
 * zero su questa rotta (misurato il 2026-11-09: con `zdr` OpenRouter non
 * trova endpoint): si chiede almeno `data_collection: deny`, e l'ADR lo
 * dichiara invece di fingere la stessa garanzia della chat.
 *
 * Segnata sul registro, non fermata dal tetto: come gli embedding, è
 * l'ingresso della conversazione, e il tetto lo applica già la risposta.
 */
export const DEFAULT_STT_MODEL = "openai/gpt-4o-mini-transcribe";

export type TranscriptOutcome =
  | { kind: "text"; text: string }
  | { kind: "unusable" }
  | { kind: "down" };

const transcriptSchema = z.object({ text: z.string() });

export interface OpenRouterSttOptions {
  db: DbClient;
  apiKey: string;
  model?: string;
  language?: string;
  accountId?: string;
  gosinoId?: string;
  timezone?: string;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export class OpenRouterSttClient {
  private readonly model: string;

  public constructor(private readonly options: OpenRouterSttOptions) {
    this.model = options.model ?? DEFAULT_STT_MODEL;
  }

  /** `pcmBase64`: int16 LE mono a 16 kHz, quello che manda il muso */
  public async transcribe(pcmBase64: string): Promise<TranscriptOutcome> {
    const wav = pcm16ToWav(Buffer.from(pcmBase64, "base64"));
    let response: Response;
    try {
      response = await fetch(new URL("/api/v1/audio/transcriptions", OPENROUTER_URL), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input_audio: { data: Buffer.from(wav).toString("base64"), format: "wav" },
          language: this.options.language ?? "it",
          provider: { data_collection: "deny" },
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return { kind: "down" };
    }
    // 4xx = il clip; 5xx = il servizio (la stessa lettura del riconoscitore di casa)
    if (response.status >= 400 && response.status < 500) {
      this.options.logger?.warn({ status: response.status }, "transcription refused the clip");
      return { kind: "unusable" };
    }
    if (!response.ok) return { kind: "down" };
    const payload: unknown = await response.json();
    await recordSpend(this.options.db, payload, {
      accountId: this.options.accountId ?? PRIME_ACCOUNT_ID,
      gosinoId: this.options.gosinoId ?? PRIME_GOSINO_ID,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: this.options.timezone ?? "Europe/Rome",
      }).format(new Date()),
      model: this.model,
    });
    const parsed = transcriptSchema.safeParse(payload);
    return parsed.success ? { kind: "text", text: parsed.data.text.trim() } : { kind: "unusable" };
  }
}
