import { decryptBytes, encryptBytes } from "./crypto.js";

/**
 * Biometric embeddings never touch a pgvector column (ADR-016): a `vector`
 * holds readable floats, and a voiceprint in the clear is exactly the datum
 * the encryption requirement exists to protect. They travel as float32
 * little-endian, sealed with AES-256-GCM, and are compared in memory after
 * decryption — on a household-sized set that costs microseconds.
 *
 * Byte layout is shared with ops/jobs (numpy `<f4`), so a profile written by
 * the Python enrollment job is readable by soul and vice versa.
 */

const FLOAT32_BYTES = 4;

export function packEmbedding(values: readonly number[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * FLOAT32_BYTES);
  values.forEach((value, index) => {
    buffer.writeFloatLE(value, index * FLOAT32_BYTES);
  });
  return buffer;
}

export function unpackEmbedding(buffer: Buffer): number[] {
  if (buffer.length % FLOAT32_BYTES !== 0) {
    throw new Error("embedding payload is not a whole number of float32 values");
  }
  const values: number[] = [];
  for (let offset = 0; offset < buffer.length; offset += FLOAT32_BYTES) {
    values.push(buffer.readFloatLE(offset));
  }
  return values;
}

export function sealEmbedding(values: readonly number[], key: Buffer): Buffer {
  return encryptBytes(packEmbedding(values), key);
}

export function openEmbedding(payload: Buffer, key: Buffer): number[] {
  return unpackEmbedding(decryptBytes(payload, key));
}

/** Cosine similarity in [-1, 1]; 0 when either side has no magnitude. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`embedding length mismatch: ${String(a.length)} vs ${String(b.length)}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
