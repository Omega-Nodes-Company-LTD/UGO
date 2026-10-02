import { z } from "zod";
import { failFor } from "../providers/types.js";
import type { Speech, SpeechAdapter, TranscribeAdapter, Transcript } from "./types.js";
import { pcm16ToWav } from "./wav.js";

/**
 * OpenRouter per la voce (ADR-123): nessun endpoint dedicato, tutto passa
 * dalla chat completions di modelli che sentono o parlano.
 *
 * - **Uscita**: `modalities: ["text","audio"]` e **streaming obbligatorio**
 *   (SSE). Si raccolgono i pezzi di `delta.audio.data` (PCM16 a 24 kHz) e si
 *   incapsulano in un WAV. Il costo arriva con l'ultimo pezzo (`usage.cost`).
 * - **Entrata**: un `input_audio` in base64 e la richiesta di trascrivere.
 */

const PCM_RATE = 24_000;

const chunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ audio: z.object({ data: z.string().optional() }).optional() }).optional() }))
    .optional(),
  usage: z.object({ cost: z.number().optional() }).optional(),
});

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).optional(),
  usage: z.object({ cost: z.number().optional() }).optional(),
});

export interface OpenRouterVoiceOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const READ_ALOUD =
  "Sei una voce che legge ad alta voce. Leggi ESATTAMENTE il testo dell'utente, in italiano, " +
  "senza aggiungere, togliere o commentare niente.";

function endpoint(options: OpenRouterVoiceOptions): URL {
  return new URL("/api/v1/chat/completions", options.baseUrl ?? "https://openrouter.ai");
}

/** Le righe `data:` di un flusso SSE, già lette per intero. */
export function sseEvents(raw: string): unknown[] {
  const events: unknown[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (data === "" || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // un commento o una riga spezzata: il resto del flusso vale lo stesso
    }
  }
  return events;
}

export class OpenRouterSpeech implements SpeechAdapter {
  public readonly provider = "openrouter" as const;
  public readonly model: string;

  public constructor(private readonly options: OpenRouterVoiceOptions) {
    this.model = options.model;
  }

  public async synth(text: string, options: { voice: string; instructions?: string }): Promise<Speech> {
    const response = await fetch(endpoint(this.options), {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        modalities: ["text", "audio"],
        audio: { voice: options.voice, format: "pcm16" },
        stream: true,
        usage: { include: true },
        messages: [
          { role: "system", content: [READ_ALOUD, options.instructions ?? ""].join(" ").trim() },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (!response.ok) throw failFor("openrouter", response.status);
    const pieces: Buffer[] = [];
    let cost: number | undefined;
    for (const event of sseEvents(await response.text())) {
      const parsed = chunkSchema.safeParse(event);
      if (!parsed.success) continue;
      for (const choice of parsed.data.choices ?? []) {
        const data = choice.delta?.audio?.data;
        // ogni pezzo si decodifica da solo: concatenare il base64 rompe il padding
        if (data !== undefined) pieces.push(Buffer.from(data, "base64"));
      }
      if (parsed.data.usage?.cost !== undefined) cost = parsed.data.usage.cost;
    }
    return {
      audio: pcm16ToWav(Buffer.concat(pieces), PCM_RATE),
      mime: "audio/wav",
      ...(cost !== undefined && { providerCostUsd: cost }),
    };
  }
}

export class OpenRouterTranscribe implements TranscribeAdapter {
  public readonly provider = "openrouter" as const;
  public readonly model: string;

  public constructor(private readonly options: OpenRouterVoiceOptions) {
    this.model = options.model;
  }

  public async transcribe(wav: Buffer): Promise<Transcript> {
    const response = await fetch(endpoint(this.options), {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        usage: { include: true },
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Trascrivi in italiano, parola per parola, quello che senti. Solo il testo, niente altro.",
              },
              { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (!response.ok) throw failFor("openrouter", response.status);
    const parsed = completionSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) return { text: "" };
    const cost = parsed.data.usage?.cost;
    return {
      text: (parsed.data.choices?.[0]?.message.content ?? "").trim(),
      ...(cost !== undefined && { providerCostUsd: cost }),
    };
  }
}
