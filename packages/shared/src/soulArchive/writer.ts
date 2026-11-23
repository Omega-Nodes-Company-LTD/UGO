import { createHash, randomBytes } from "node:crypto";
import { sealChunks } from "./cipher.js";
import { ArchiveError } from "./errors.js";
import {
  DEFAULT_CHUNK_LOG2,
  DEFAULT_KDF,
  encodeHeader,
  NONCE_PREFIX_BYTES,
  SALT_BYTES,
  TABLE_NAME,
  type KdfParams,
} from "./format.js";
import { frameEntries, type EntryData, type EntryInput } from "./framing.js";
import { deriveKey } from "./kdf.js";
import { soulManifestSchema, type IntegrityFile, type SoulManifest } from "./manifest.js";
import { canonicalSecret } from "./recoveryCode.js";

export interface TableInput {
  /** a database table name; becomes `tables/<table>.ndjson` */
  table: string;
  /** NDJSON: one JSON value per line, every line ending in `\n` */
  data: EntryData;
}

export interface WriteOptions {
  manifest: SoulManifest;
  tables: Iterable<TableInput> | AsyncIterable<TableInput>;
  /** a recovery code or a chosen passphrase */
  secret: string;
  kdf?: KdfParams;
  chunkLog2?: number;
}

interface Meter {
  bytes: number;
  rows: number;
}

async function* metered(data: EntryData, hash: ReturnType<typeof createHash>, meter: Meter) {
  const pieces: Iterable<Uint8Array> | AsyncIterable<Uint8Array> =
    data instanceof Uint8Array ? [data] : data;
  for await (const piece of pieces) {
    hash.update(piece);
    meter.bytes += piece.length;
    for (let at = piece.indexOf(10); at !== -1; at = piece.indexOf(10, at + 1)) meter.rows += 1;
    yield piece;
  }
}

/**
 * Produces the archive as a stream of buffers (header first). The integrity
 * record — digest, byte and row count per table — is computed *while writing*
 * from the bytes that actually went out, never from what the caller claims.
 *
 * Nothing here touches the filesystem or the database: the caller owns where
 * rows come from and where the output goes.
 */
export async function* writeSoulArchive(options: WriteOptions): AsyncGenerator<Buffer> {
  const manifest = soulManifestSchema.parse(options.manifest);
  const kdf = options.kdf ?? DEFAULT_KDF;
  const header = {
    kdf,
    chunkLog2: options.chunkLog2 ?? DEFAULT_CHUNK_LOG2,
    salt: randomBytes(SALT_BYTES),
    noncePrefix: randomBytes(NONCE_PREFIX_BYTES),
  };
  const headerBytes = encodeHeader(header);
  const key = await deriveKey(canonicalSecret(options.secret), header.salt, kdf);
  const files: IntegrityFile[] = [];

  async function* entries(): AsyncGenerator<EntryInput> {
    yield { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest), "utf8") };
    const seen = new Set<string>();
    for await (const input of options.tables) {
      if (!TABLE_NAME.test(input.table) || seen.has(input.table)) {
        throw new ArchiveError("bad-entry-name", "table name invalid or repeated");
      }
      seen.add(input.table);
      const hash = createHash("sha256");
      const meter: Meter = { bytes: 0, rows: 0 };
      const name = `tables/${input.table}.ndjson`;
      yield { name, data: metered(input.data, hash, meter) };
      // resumed only after the framer consumed the whole table
      files.push({ name, bytes: meter.bytes, sha256: hash.digest("hex"), rows: meter.rows });
    }
    yield { name: "integrity.json", data: Buffer.from(JSON.stringify({ files }), "utf8") };
  }

  yield headerBytes;
  yield* sealChunks(
    frameEntries(entries()),
    key,
    headerBytes,
    header.noncePrefix,
    2 ** header.chunkLog2,
  );
}
