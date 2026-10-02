import { z } from "zod";
import { failFor } from "../providers/types.js";
import type { Speech, SpeechAdapter, TranscribeAdapter, Transcript } from "./types.js";

/**
 * ElevenLabs: la voce più espressiva, e una trascrizione (Scribe). Non dice
 * quanto costa una chiamata: il cancello stima dal listino e lo dichiara.
 */

export interface ElevenLabsOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const transcriptSchema = z.object({ text: z.string() });

export class ElevenLabsSpeech implements SpeechAdapter {
  public readonly provider = "elevenlabs" as const;
  public readonly model: string;

  public constructor(private readonly options: ElevenLabsOptions) {
    this.model = options.model;
  }

  public async synth(text: string, options: { voice: string }): Promise<Speech> {
    const url = new URL(
      `/v1/text-to-speech/${encodeURIComponent(options.voice)}`,
      this.options.baseUrl ?? "https://api.elevenlabs.io",
    );
    url.searchParams.set("output_format", "mp3_44100_128");
    const response = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": this.options.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: this.model, language_code: "it" }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
    });
    if (!response.ok) throw failFor("elevenlabs", response.status);
    return { audio: Buffer.from(await response.arrayBuffer()), mime: "audio/mpeg" };
  }
}

export class ElevenLabsTranscribe implements TranscribeAdapter {
  public readonly provider = "elevenlabs" as const;
  public readonly model: string;

  public constructor(private readonly options: ElevenLabsOptions) {
    this.model = options.model;
  }

  public async transcribe(wav: Buffer): Promise<Transcript> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "enunciato.wav");
    form.append("model_id", this.model);
    form.append("language_code", "ita");
    const response = await fetch(
      new URL("/v1/speech-to-text", this.options.baseUrl ?? "https://api.elevenlabs.io"),
      {
        method: "POST",
        headers: { "xi-api-key": this.options.apiKey },
        body: form,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      },
    );
    if (!response.ok) throw failFor("elevenlabs", response.status);
    const parsed = transcriptSchema.safeParse(await response.json().catch(() => undefined));
    return { text: parsed.success ? parsed.data.text.trim() : "" };
  }
}
