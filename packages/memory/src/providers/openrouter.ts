import { z } from "zod";
import {
  failFor,
  type Completion,
  type CompletionAdapter,
  type CompletionRequest,
  type ContentPart,
} from "./types.js";

/**
 * OpenRouter: l'API compatibile OpenAI davanti a centinaia di modelli.
 *
 * Due dettagli che contano:
 * - `usage: {include: true}` fa dire a lui quanto è costato: il listino di
 *   ogni modello è suo, e copiarlo qui sarebbe il modo di farlo invecchiare;
 * - per i modelli `anthropic/*` OpenRouter inoltra `cache_control` sulle parti
 *   di testo: i blocchi statici restano parti separate e marcate, così la
 *   cache della regola 2 vale anche passando di qua. Per gli altri modelli i
 *   blocchi si concatenano: lì non c'è una cache da proteggere.
 */

const responseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullish() }) }))
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().optional(),
      prompt_tokens_details: z
        .object({
          cached_tokens: z.number().optional(),
          cache_write_tokens: z.number().optional(),
        })
        .nullish(),
    })
    .optional(),
});

export interface OpenRouterAdapterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** come ci presentiamo a OpenRouter (classifiche e limiti per app) */
  referer?: string;
}

function part(p: ContentPart): Record<string, unknown> {
  return p.type === "text"
    ? { type: "text", text: p.text }
    : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } };
}

export class OpenRouterAdapter implements CompletionAdapter {
  public readonly provider = "openrouter" as const;
  public readonly model: string;

  public constructor(private readonly options: OpenRouterAdapterOptions) {
    this.model = options.model;
  }

  private systemMessage(request: CompletionRequest): Record<string, unknown> | undefined {
    const blocks = request.system.filter((b) => b.text !== "");
    if (blocks.length === 0) return undefined;
    if (this.model.startsWith("anthropic/")) {
      return {
        role: "system",
        content: blocks.map((b) => ({
          type: "text",
          text: b.text,
          ...(b.cache && { cache_control: { type: "ephemeral" } }),
        })),
      };
    }
    return { role: "system", content: blocks.map((b) => b.text).join("\n\n") };
  }

  public body(request: CompletionRequest): Record<string, unknown> {
    const system = this.systemMessage(request);
    return {
      model: this.model,
      max_tokens: request.maxTokens,
      messages: [
        ...(system === undefined ? [] : [system]),
        ...request.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content.map(part),
        })),
      ],
      usage: { include: true },
      ...(request.temperature !== undefined && { temperature: request.temperature }),
    };
  }

  public async complete(request: CompletionRequest): Promise<Completion> {
    const response = await fetch(
      new URL("/api/v1/chat/completions", this.options.baseUrl ?? "https://openrouter.ai"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.referer !== undefined && {
            "http-referer": this.options.referer,
            "x-title": "UGO",
          }),
        },
        body: JSON.stringify(this.body(request)),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
      },
    );
    if (!response.ok) throw failFor("openrouter", response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { text: "", usage: undefined };
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) return { text: "", usage: undefined };
    const usage = parsed.data.usage;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const written = usage?.prompt_tokens_details?.cache_write_tokens ?? 0;
    return {
      text: (parsed.data.choices?.[0]?.message.content ?? "").trim(),
      usage:
        usage === undefined
          ? undefined
          : {
              // prompt_tokens comprende già le parti in cache: si scompone
              inputTokens: Math.max(0, (usage.prompt_tokens ?? 0) - cached - written),
              outputTokens: usage.completion_tokens ?? 0,
              cacheCreationInputTokens: written,
              cacheReadInputTokens: cached,
            },
      ...(usage?.cost !== undefined && { providerCostUsd: usage.cost }),
    };
  }
}
