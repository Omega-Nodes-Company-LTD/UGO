/**
 * La porta degli embedding. ADR-131: l'unica implementazione è
 * `OpenRouterEmbeddingsClient` (768 dimensioni, come lo schema).
 */
export interface EmbeddingsClient {
  embed(texts: readonly string[]): Promise<number[][]>;
}
