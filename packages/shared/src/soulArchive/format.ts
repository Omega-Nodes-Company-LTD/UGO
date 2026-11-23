import { ArchiveError } from "./errors.js";

/**
 * The `.ugosoul` container, version 1 — layout constants and the plaintext
 * header. Full specification: docs/FORMATO_UGOSOUL.md.
 *
 * Header (37 bytes, plaintext, authenticated as AAD on every chunk):
 *   0   8  magic "UGOSOUL\0"
 *   8   1  format major
 *   9   1  KDF id (1 = scrypt)
 *   10  1  log2(N)       11 1  r       12 1  p
 *   13  1  log2(plaintext chunk size)
 *   14  16 salt
 *   30  7  nonce prefix
 */
export const MAGIC = Buffer.from("UGOSOUL\0", "latin1");
export const FORMAT_MAJOR = 1;
export const FORMAT_MINOR = 0;
export const HEADER_BYTES = 37;
export const KDF_SCRYPT = 1;
export const SALT_BYTES = 16;
export const NONCE_PREFIX_BYTES = 7;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;

export const MIN_CHUNK_LOG2 = 12;
export const MAX_CHUNK_LOG2 = 24;
export const DEFAULT_CHUNK_LOG2 = 16;
/** one data frame inside an entry never exceeds this, whatever the caller streams */
export const MAX_FRAME_BYTES = 1 << 20;

export interface KdfParams {
  log2N: number;
  r: number;
  p: number;
}

/** 128 MiB, a few tenths of a second on a mini-PC. The reader accepts up to 256 MiB. */
export const DEFAULT_KDF: KdfParams = { log2N: 17, r: 8, p: 1 };
export const KDF_MAX_MEMORY_BYTES = 256 * 1024 * 1024;

export function kdfMemoryBytes(params: KdfParams): number {
  return 128 * 2 ** params.log2N * params.r;
}

/**
 * The header is untrusted input read *before* anything is authenticated, so a
 * hostile file must not be able to make us spend gigabytes deriving a key.
 */
export function assertKdfParams(params: KdfParams): void {
  const ok =
    Number.isInteger(params.log2N) &&
    Number.isInteger(params.r) &&
    Number.isInteger(params.p) &&
    params.log2N >= 10 &&
    params.log2N <= 20 &&
    params.r >= 1 &&
    params.r <= 16 &&
    params.p >= 1 &&
    params.p <= 4 &&
    kdfMemoryBytes(params) <= KDF_MAX_MEMORY_BYTES;
  if (!ok) throw new ArchiveError("bad-kdf-params", "key-derivation parameters out of range");
}

export interface ArchiveHeader {
  kdf: KdfParams;
  chunkLog2: number;
  salt: Buffer;
  noncePrefix: Buffer;
}

export function encodeHeader(header: ArchiveHeader): Buffer {
  assertKdfParams(header.kdf);
  if (header.chunkLog2 < MIN_CHUNK_LOG2 || header.chunkLog2 > MAX_CHUNK_LOG2) {
    throw new ArchiveError("malformed", "chunk size out of range");
  }
  return Buffer.concat([
    MAGIC,
    Buffer.from([
      FORMAT_MAJOR,
      KDF_SCRYPT,
      header.kdf.log2N,
      header.kdf.r,
      header.kdf.p,
      header.chunkLog2,
    ]),
    header.salt,
    header.noncePrefix,
  ]);
}

export function decodeHeader(bytes: Buffer): ArchiveHeader {
  if (bytes.length !== HEADER_BYTES) throw new ArchiveError("truncated", "header too short");
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new ArchiveError("bad-magic", "not a UGO soul archive");
  }
  if (bytes[8] !== FORMAT_MAJOR) {
    throw new ArchiveError("unsupported-version", "archive format version not supported");
  }
  if (bytes[9] !== KDF_SCRYPT) {
    throw new ArchiveError("bad-kdf-params", "unknown key-derivation function");
  }
  const kdf: KdfParams = { log2N: bytes[10] ?? 0, r: bytes[11] ?? 0, p: bytes[12] ?? 0 };
  assertKdfParams(kdf);
  const chunkLog2 = bytes[13] ?? 0;
  if (chunkLog2 < MIN_CHUNK_LOG2 || chunkLog2 > MAX_CHUNK_LOG2) {
    throw new ArchiveError("malformed", "chunk size out of range");
  }
  return {
    kdf,
    chunkLog2,
    salt: Buffer.from(bytes.subarray(14, 14 + SALT_BYTES)),
    noncePrefix: Buffer.from(bytes.subarray(30, 30 + NONCE_PREFIX_BYTES)),
  };
}

/** `tables/<name>.ndjson`: the only place a table name is allowed to come from. */
export const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const ENTRY_NAME = /^(?:manifest\.json|integrity\.json|tables\/[a-z][a-z0-9_]{0,62}\.ndjson)$/u;

/**
 * Entry names are labels, never paths: nothing in this codebase turns one into
 * a file name. The whitelist is still strict so that a future change cannot
 * make that mistake exploitable.
 */
export function assertEntryName(name: string): string {
  if (!ENTRY_NAME.test(name)) throw new ArchiveError("bad-entry-name", "entry name not allowed");
  return name;
}

export interface ReadLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: ReadLimits = {
  maxEntries: 512,
  maxEntryBytes: 2 * 1024 ** 3,
  maxTotalBytes: 8 * 1024 ** 3,
};
