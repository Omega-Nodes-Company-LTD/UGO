import { z } from "zod";
import { failFor } from "../providers/types.js";
import type { Speech, SpeechAdapter, TranscribeAdapter, Transcript } from "./types.js";

/** OpenAI: `/v1/audio/speech` e `/v1/audio/transcriptions` (ADR-123). */

export interface OpenAiVoiceOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const transcriptSchema = z.object({ text: z.string() });

export class OpenAiSpeech implements SpeechAdapter {
  public readonly provider = "openai" as const;
  public readonly model: string;

  public constructor(private readonly options: OpenAiVoiceOptions) {
    this.model = options.model;
  }

  public async synth(text: string, options: { voice: string; instructions?: string }): Promise<Speech> {
    const response = await fetch(
      new URL("/v1/audio/speech", this.options.baseUrl ?? "https://api.openai.com"),
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          voice: options.voice,
          input: text,
          // solo i modelli gpt-4o-*-tts capiscono il tono; tts-1 lo rifiuterebbe
          ...(options.instructions !== undefined &&
            this.model.startsWith("gpt-") && { instructions: options.instructions }),
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      },
    );
    if (!response.ok) throw failFor("openai", response.status);
    return { audio: Buffer.from(await response.arrayBuffer()), mime: "audio/mpeg" };
  }
}

export class OpenAiTranscribe implements TranscribeAdapter {
  public readonly provider = "openai" as const;
  public readonly model: string;

  public constructor(private readonly options: OpenAiVoiceOptions) {
    this.model = options.model;
  }

  public async transcribe(wav: Buffer): Promise<Transcript> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "enunciato.wav");
    form.append("model", this.model);
    form.append("language", "it");
    form.append("response_format", "json");
    const response = await fetch(
      new URL("/v1/audio/transcriptions", this.options.baseUrl ?? "https://api.openai.com"),
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      },
    );
    if (!response.ok) throw failFor("openai", response.status);
    const parsed = transcriptSchema.safeParse(await response.json().catch(() => undefined));
    return { text: parsed.success ? parsed.data.text.trim() : "" };
  }
}
