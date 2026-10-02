import { z } from "zod";
import { anthropicModel } from "../pricing.js";
import {
  failFor,
  type Completion,
  type CompletionAdapter,
  type CompletionRequest,
  type ContentPart,
} from "./types.js";

/**
 * Anthropic Messages API, a mano con `fetch` come è sempre stato in questo
 * repository (nessun SDK nuovo da mettere sotto audit, NIS2).
 *
 * Il caching (regola 2) sta nei blocchi di sistema marcati `cache`: l'adapter
 * li traduce in `cache_control` senza riordinarli. Chi costruisce la richiesta
 * mette i blocchi statici in testa; qui non si interpola niente.
 */

const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullish(),
  cache_read_input_tokens: z.number().nullish(),
});

const contentSchema = z.array(z.object({ type: z.string(), text: z.string().optional() }));

/** Quanto spazio dare al pensiero di un modello che non si può spegnere. */
const THINKING_HEADROOM = 2048;

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

function part(p: ContentPart): Record<string, unknown> {
  return p.type === "text"
    ? { type: "text", text: p.text }
    : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } };
}

export class AnthropicAdapter implements CompletionAdapter {
  public readonly provider = "anthropic" as const;
  public readonly model: string;

  public constructor(private readonly options: AnthropicAdapterOptions) {
    this.model = options.model;
  }

  /** Il corpo della richiesta: puro, ed è ciò che i test d'integrazione catturano. */
  public body(request: CompletionRequest): Record<string, unknown> {
    const known = anthropicModel(this.model);
    const thinking = known?.thinking ?? "omit";
    return {
      model: this.model,
      max_tokens:
        thinking === "always" ? request.maxTokens + THINKING_HEADROOM : request.maxTokens,
      system: request.system.map((block) => ({
        type: "text",
        text: block.text,
        ...(block.cache && { cache_control: { type: "ephemeral" } }),
      })),
      messages: request.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content.map(part),
      })),
      ...(thinking === "disabled" && { thinking: { type: "disabled" } }),
      ...(thinking === "between_tools" && { thinking: { type: "between_tools" } }),
      ...(thinking === "always" && { output_config: { effort: "low" } }),
      ...(request.temperature !== undefined &&
        known?.sampling === true && { temperature: request.temperature }),
    };
  }

  public async complete(request: CompletionRequest): Promise<Completion> {
    const response = await fetch(
      new URL("/v1/messages", this.options.baseUrl ?? "https://api.anthropic.com"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(this.body(request)),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
      },
    );
    if (!response.ok) throw failFor("anthropic", response.status);

    // da qui la chiamata è pagata: niente più eccezioni, solo ciò che si legge
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { text: "", usage: undefined };
    }
    const record = (payload ?? {}) as { usage?: unknown; content?: unknown };
    const counted = usageSchema.safeParse(record.usage);
    const content = contentSchema.safeParse(record.content);
    const text = content.success
      ? content.data
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("")
          .trim()
      : "";
    return {
      text,
      usage: counted.success
        ? {
            inputTokens: counted.data.input_tokens,
            outputTokens: counted.data.output_tokens,
            cacheCreationInputTokens: counted.data.cache_creation_input_tokens ?? 0,
            cacheReadInputTokens: counted.data.cache_read_input_tokens ?? 0,
          }
        : undefined,
    };
  }
}
