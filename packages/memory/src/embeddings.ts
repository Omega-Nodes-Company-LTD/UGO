import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { z } from "zod";

export interface EmbeddingsClient {
  embed(texts: readonly string[]): Promise<number[][]>;
}

const embedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

/** Ollama /api/embed client (nomic-embed-text, 768d — ADR-001/ADR-005). */
export class OllamaEmbeddingsClient implements EmbeddingsClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs = 30_000,
  ) {}

  public async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await fetch(new URL("/api/embed", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`embeddings request failed with status ${String(response.status)}`);
    }
    const { embeddings } = embedResponseSchema.parse(await response.json());
    if (embeddings.length !== texts.length) {
      throw new Error("embeddings count does not match input count");
    }
    for (const vector of embeddings) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `expected ${String(EMBEDDING_DIMENSIONS)}-dim embeddings, got ${String(vector.length)}`,
        );
      }
    }
    return embeddings;
  }
}
