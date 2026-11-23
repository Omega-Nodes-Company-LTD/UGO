import { randomBytes } from "node:crypto";
import type { SoulManifest } from "./manifest.js";
import type { KdfParams } from "./format.js";

/**
 * Shared fixtures for the archive tests. Fast KDF settings only — the
 * production cost (128 MiB, ~0.3 s per derivation) is exercised in exactly one
 * test, so the suite stays quick without weakening what ships.
 */
export const FAST_KDF: KdfParams = { log2N: 10, r: 8, p: 1 };
export const SECRET = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01";

export function manifest(overrides: Partial<SoulManifest> = {}): SoulManifest {
  return {
    kind: "ugo-soul",
    formatVersion: { major: 1, minor: 0 },
    createdAt: "2026-11-23T10:00:00.000Z",
    generator: { name: "ugo-soul", version: "0.0.0-test" },
    mode: "trasloco",
    source: {
      schemaVersion: "0062_la-cartolina",
      embeddingModel: "openai/text-embedding-3-small",
      embeddingDimensions: 768,
    },
    gosinoIds: ["8f0c1e5a-3b0e-4c53-9a43-2f1d6b7a9c10"],
    omissions: [
      {
        category: "biometrics",
        table: "recognition_profiles",
        reason: "le impronte di volto e voce non lasciano la casa (ADR-016)",
        count: 3,
      },
    ],
    ...overrides,
  };
}

/** A few NDJSON lines with a stable, non-trivial size. */
export function ndjson(rows: number, pad = 40): Buffer {
  const lines: string[] = [];
  for (let i = 0; i < rows; i += 1) {
    lines.push(JSON.stringify({ id: i, text: randomBytes(pad).toString("hex") }));
  }
  return Buffer.from(lines.join("\n") + "\n", "utf8");
}

export async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}

/** Splits a buffer into odd-sized pieces, as a network or a file stream would. */
export async function* trickle(data: Buffer, piece: number): AsyncGenerator<Buffer> {
  for (let at = 0; at < data.length; at += piece) {
    yield data.subarray(at, at + piece);
    await Promise.resolve();
  }
}
