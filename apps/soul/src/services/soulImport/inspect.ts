import {
  SOUL_ARCHIVE_FORMAT_MAJOR,
  SOUL_ARCHIVE_FORMAT_MINOR,
  assessCompatibility,
  openSoulArchive,
  type Compatibility,
  type SoulManifest,
} from "@ugo/shared";
import { TABLES } from "../soulExport/policyTables.js";
import { jsonLines } from "./lines.js";

/**
 * What an archive holds and what importing it will cost — read from the file
 * alone, **before** any database is touched (ADR-132, MKT-10.5). It is what the
 * setup page shows a person between "I picked the file" and "do it": which
 * creature, how much, what was left behind, whether this version can take it,
 * and the (small) bill for rebuilding the search vectors on their own key.
 *
 * It reads the whole archive, so it also proves the file is intact before
 * anyone commits to it.
 */

/**
 * `openai/text-embedding-3-small`, USD per million tokens. A reference figure,
 * not a quote: the real cost is whatever OpenRouter reports back and the
 * ledger records. It is deliberately a constant in one place so that the
 * preview and the documentation cannot disagree about it.
 */
export const EMBEDDING_USD_PER_MILLION_TOKENS = 0.02;
/** a rough average for mixed Italian and English prose */
const CHARACTERS_PER_TOKEN = 4;

export interface ArchiveInspection {
  manifest: SoulManifest;
  compatibility: Compatibility;
  tables: { table: string; rows: number }[];
  embeddings: {
    /** rows that will need a vector */
    rows: number;
    estimatedTokens: number;
    estimatedUsd: number;
    basis: string;
  };
}

export async function inspectSoulArchive(
  source: AsyncIterable<Uint8Array>,
  secret: string,
  runtime: { schemaVersion: string; embeddingModel: string },
): Promise<ArchiveInspection> {
  const archive = await openSoulArchive(source, secret);
  const compatibility = assessCompatibility(archive.manifest, {
    supportedMajor: SOUL_ARCHIVE_FORMAT_MAJOR,
    supportedMinor: SOUL_ARCHIVE_FORMAT_MINOR,
    ...runtime,
  });

  let rows = 0;
  let characters = 0;
  for await (const stream of archive.tables) {
    const spec = TABLES[stream.table]?.embed;
    if (spec === undefined) {
      for await (const piece of stream.data) void piece;
      continue;
    }
    for await (const row of jsonLines(stream.data)) {
      const text = row[spec.from];
      if (typeof text === "string" && text !== "") {
        rows += 1;
        characters += text.length;
      }
    }
  }
  // the loop ending is the integrity check: only now are the counts trustworthy
  const estimatedTokens = Math.ceil(characters / CHARACTERS_PER_TOKEN);
  return {
    manifest: archive.manifest,
    compatibility,
    tables: archive.integrity().files.map((file) => ({
      table: file.name.replace(/^tables\//u, "").replace(/\.ndjson$/u, ""),
      rows: file.rows,
    })),
    embeddings: {
      rows,
      estimatedTokens,
      estimatedUsd: (estimatedTokens / 1_000_000) * EMBEDDING_USD_PER_MILLION_TOKENS,
      basis: `stima: circa ${String(CHARACTERS_PER_TOKEN)} caratteri per token, listino di riferimento ${String(EMBEDDING_USD_PER_MILLION_TOKENS)} $ per milione di token; il costo vero lo riporta il fornitore e finisce sul registro`,
    },
  };
}
