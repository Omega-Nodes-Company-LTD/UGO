import type { GenerateOptions, LocalTextClient } from "./localText.js";
import type { LlmClient } from "./llmClient.js";

/**
 * Il «modello di casa» dopo ADR-131: la stessa porta di prima
 * (`LocalTextClient`, una frase o `undefined`, mai un'eccezione), ma dietro
 * c'è OpenRouter attraverso `LlmClient` — l'unico varco (regola 3).
 *
 * Un salvadanaio finito non è un testo: torna `undefined`, e chi chiama fa
 * quello che faceva quando il modello di casa era spento.
 */
export class OpenRouterTextClient implements LocalTextClient {
  public constructor(
    private readonly llm: Pick<LlmClient, "generate">,
    private readonly logger?: { warn: (data: Record<string, unknown>, message: string) => void },
  ) {}

  public available(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public async generate(
    prompt: string,
    maxTokens = 120,
    options: GenerateOptions = {},
  ): Promise<string | undefined> {
    try {
      const result = await this.llm.generate(prompt, maxTokens, options.temperature ?? 0.8);
      if (result.degraded) return undefined;
      return result.text === "" ? undefined : result.text;
    } catch (error) {
      this.logger?.warn(
        { error: error instanceof Error ? error.message : "unknown" },
        "text via OpenRouter failed: the caller goes on without it",
      );
      return undefined;
    }
  }
}
