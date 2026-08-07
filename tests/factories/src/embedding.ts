import { EMBEDDING_DIMENSIONS } from "@ugo/shared";

/**
 * Deterministic pseudo-random unit vector for tests.
 * Same seed → same vector, so similarity assertions are reproducible
 * without depending on a live embedding model (which would be Fase 1 scope).
 */
export function embeddingFromSeed(seed: number, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const values: number[] = [];
  let state = seed >>> 0;
  for (let i = 0; i < dimensions; i += 1) {
    // xorshift32: cheap, deterministic, good enough for test vectors
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    values.push(state / 0xffffffff - 0.5);
  }
  const norm = Math.hypot(...values);
  return values.map((v) => v / norm);
}
