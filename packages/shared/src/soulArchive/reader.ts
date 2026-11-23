import { createHash } from "node:crypto";
import { ByteReader } from "./byteReader.js";
import { openChunks } from "./cipher.js";
import { ArchiveError } from "./errors.js";
import { decodeHeader, DEFAULT_LIMITS, FORMAT_MAJOR, HEADER_BYTES, type ReadLimits } from "./format.js";
import { readEntries, type RawEntry } from "./framing.js";
import { deriveKey } from "./kdf.js";
import {
  integritySchema,
  soulManifestSchema,
  type Integrity,
  type IntegrityFile,
  type SoulManifest,
} from "./manifest.js";
import { canonicalSecret } from "./recoveryCode.js";

export interface TableStream {
  table: string;
  /** NDJSON bytes. Safe to abandon early: the rest is still read and verified. */
  data: AsyncIterable<Buffer>;
}

export interface SoulArchive {
  manifest: SoulManifest;
  /**
   * Yields each table in order. **The archive is only trustworthy once this
   * iteration has completed**: the integrity record is the last thing in the
   * file, so anything built from earlier tables must stay uncommitted (one
   * database transaction) until the loop ends without throwing.
   */
  tables: AsyncGenerator<TableStream, void>;
  /** The verified integrity record. Throws if the iteration has not finished. */
  integrity(): Integrity;
}

const SMALL_ENTRY_BYTES = 1 << 20;

async function readSmall(entry: RawEntry): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for (let piece = await entry.pull(); piece !== undefined; piece = await entry.pull()) {
    size += piece.length;
    if (size > SMALL_ENTRY_BYTES) throw new ArchiveError("limit-exceeded", "record too large");
    parts.push(piece);
  }
  return Buffer.concat(parts);
}

function parseJson<T>(bytes: Buffer, parse: (value: unknown) => T, what: string): T {
  try {
    return parse(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new ArchiveError("malformed", `${what} is not valid`);
  }
}

function countRows(piece: Buffer): number {
  let rows = 0;
  for (let at = piece.indexOf(10); at !== -1; at = piece.indexOf(10, at + 1)) rows += 1;
  return rows;
}

function sameFile(a: IntegrityFile, b: IntegrityFile): boolean {
  return a.name === b.name && a.bytes === b.bytes && a.sha256 === b.sha256 && a.rows === b.rows;
}

export async function openSoulArchive(
  source: AsyncIterable<Uint8Array>,
  secret: string,
  limits: Partial<ReadLimits> = {},
): Promise<SoulArchive> {
  const effective: ReadLimits = { ...DEFAULT_LIMITS, ...limits };
  const raw = new ByteReader(source);
  const headerBytes = await raw.read(HEADER_BYTES);
  const header = decodeHeader(headerBytes);
  const key = await deriveKey(canonicalSecret(secret), header.salt, header.kdf);
  const plain = openChunks(raw, key, headerBytes, header.noncePrefix, 2 ** header.chunkLog2);
  const entries = readEntries(plain, effective);

  const first = await entries.next();
  if (first.done === true || first.value.name !== "manifest.json") {
    throw new ArchiveError("malformed", "the archive does not start with its manifest");
  }
  const manifest = parseJson(await readSmall(first.value), (v) => soulManifestSchema.parse(v), "manifest");
  if (manifest.formatVersion.major !== FORMAT_MAJOR) {
    throw new ArchiveError("unsupported-version", "archive format version not supported");
  }

  let verified: Integrity | undefined;

  async function* tables(): AsyncGenerator<TableStream, void> {
    const seen: IntegrityFile[] = [];
    for (;;) {
      const next = await entries.next();
      if (next.done === true) {
        throw new ArchiveError("truncated", "the archive has no integrity record");
      }
      const entry = next.value;

      if (entry.name === "integrity.json") {
        const claimed = parseJson(await readSmall(entry), (v) => integritySchema.parse(v), "integrity record");
        const matches =
          claimed.files.length === seen.length &&
          claimed.files.every((file, i) => {
            const actual = seen[i];
            return actual !== undefined && sameFile(file, actual);
          });
        if (!matches) throw new ArchiveError("integrity-mismatch", "the archive does not match its integrity record");
        if ((await entries.next()).done !== true) {
          throw new ArchiveError("malformed", "entries after the integrity record");
        }
        verified = claimed;
        return;
      }
      if (!entry.name.startsWith("tables/")) {
        throw new ArchiveError("malformed", "unexpected entry");
      }
      if (seen.some((file) => file.name === entry.name)) {
        throw new ArchiveError("malformed", "table appears twice");
      }

      const hash = createHash("sha256");
      let bytes = 0;
      let rows = 0;
      const pull = async (): Promise<Buffer | undefined> => {
        const piece = await entry.pull();
        if (piece !== undefined) {
          hash.update(piece);
          bytes += piece.length;
          rows += countRows(piece);
        }
        return piece;
      };
      // no `return()` on purpose: `break` in the consumer must not close the stream
      const data: AsyncIterable<Buffer> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            const piece = await pull();
            return piece === undefined
              ? { done: true as const, value: undefined }
              : { done: false as const, value: piece };
          },
        }),
      };
      yield { table: entry.name.slice("tables/".length, -".ndjson".length), data };
      while ((await pull()) !== undefined) continue; // whatever the consumer left
      seen.push({ name: entry.name, bytes, sha256: hash.digest("hex"), rows });
    }
  }

  return {
    manifest,
    tables: tables(),
    integrity: (): Integrity => {
      if (verified === undefined) throw new Error("archive not fully read yet");
      return verified;
    },
  };
}
