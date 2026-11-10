import type { LlmClient } from "./llmClient.js";
import type { LocalVisionClient } from "./localVision.js";

/**
 * Gli occhi via OpenRouter (ADR-131), dietro la stessa porta di quelli
 * locali: chi chiama riceve una frase o `undefined`, mai un'eccezione.
 *
 * Non è un secondo client a pagamento: delega a `LlmClient`, che resta
 * l'unico varco (regola 3) — tetto, salvadanaio e riga sul registro.
 * Un salvadanaio vuoto non è una descrizione: torna `undefined`, e la chat
 * dice con onestà che stavolta non l'ha vista.
 */
export class OpenRouterVisionClient implements LocalVisionClient {
  public constructor(
    private readonly llm: Pick<LlmClient, "describeImage">,
    private readonly model: string,
    private readonly logger?: { warn: (data: Record<string, unknown>, message: string) => void },
  ) {}

  public available(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public async describe(imageBase64: string): Promise<string | undefined> {
    try {
      const seen = await this.llm.describeImage(imageBase64, this.model);
      if (seen.degraded) return undefined;
      return seen.text === "" ? undefined : seen.text;
    } catch (error) {
      // solo il messaggio: mai il corpo, che potrebbe riportare il contenuto
      this.logger?.warn(
        { model: this.model, error: error instanceof Error ? error.message : "unknown" },
        "vision via OpenRouter failed: the photo stays undescribed",
      );
      return undefined;
    }
  }
}
