import { z } from "zod";

/**
 * Local text generation through Ollama (`/api/generate`).
 *
 * Deliberately NOT routed through `LlmClient`: that guard exists to stop money
 * leaking to a paid provider (CLAUDE.md rule 3), and this costs nothing. What
 * it does share is the discipline — a hard timeout, a bounded output, and a
 * caller that must survive the model being absent, because on a fresh server
 * nobody has pulled it yet.
 *
 * Used by initiative (ADR-027) to turn what UGO knows into a question worth
 * asking. Everything else about initiative is zero-token by construction; this
 * is the one step that needs words invented, and it stays on our own iron.
 */

const generateResponseSchema = z.object({ response: z.string() });

export interface LocalTextClient {
  /** Returns undefined when the model is unreachable: never throws at callers. */
  generate(prompt: string, maxTokens?: number): Promise<string | undefined>;
  available(): Promise<boolean>;
}

export class OllamaTextClient implements LocalTextClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs = 45_000,
  ) {}

  public async available(): Promise<boolean> {
    try {
      const response = await fetch(new URL("/api/tags", this.baseUrl), {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { models?: { name: string }[] };
      return (body.models ?? []).some((m) => m.name.startsWith(this.model.split(":")[0] ?? ""));
    } catch {
      return false;
    }
  }

  public async generate(prompt: string, maxTokens = 120): Promise<string | undefined> {
    try {
      const response = await fetch(new URL("/api/generate", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { num_predict: maxTokens, temperature: 0.8 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return undefined;
      const parsed = generateResponseSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      const text = parsed.data.response.trim();
      return text.length === 0 ? undefined : text;
    } catch {
      // unreachable, timed out, model not pulled: initiative falls back to the
      // acts that need no words at all
      return undefined;
    }
  }
}
