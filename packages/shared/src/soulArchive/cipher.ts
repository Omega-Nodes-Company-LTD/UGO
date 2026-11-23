import { createCipheriv, createDecipheriv } from "node:crypto";
import type { ByteReader } from "./byteReader.js";
import { ArchiveError } from "./errors.js";
import { NONCE_PREFIX_BYTES, TAG_BYTES } from "./format.js";

/**
 * Chunked AES-256-GCM in the STREAM construction (Hoang–Reyhanitabar–Rogaway):
 *
 *   nonce(12) = noncePrefix(7) || chunkIndex(u32 BE) || lastFlag(1)
 *   AAD       = the 37 header bytes
 *   wire      = [u32 BE ciphertext+tag length][ciphertext || tag]  per chunk
 *
 * What that buys, each asserted by a test: a flipped bit fails its chunk;
 * reordering fails (the index is in the nonce); dropping or cutting the tail
 * fails (the last chunk is only valid *as* last, and "last" is defined by "no
 * more bytes follow"); appending fails for the same reason; and changing the
 * header — including the KDF cost — fails everything (header is AAD).
 *
 * Memory stays at one chunk, so a multi-gigabyte archive streams.
 */
function nonce(prefix: Buffer, index: number, last: boolean): Buffer {
  if (index > 0xffffffff) throw new ArchiveError("limit-exceeded", "too many chunks");
  const out = Buffer.alloc(12);
  prefix.copy(out, 0, 0, NONCE_PREFIX_BYTES);
  out.writeUInt32BE(index, NONCE_PREFIX_BYTES);
  out[11] = last ? 1 : 0;
  return out;
}

function sealOne(plain: Buffer, key: Buffer, aad: Buffer, prefix: Buffer, index: number, last: boolean): Buffer {
  const cipher = createCipheriv("aes-256-gcm", key, nonce(prefix, index, last), {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, body]);
}

export async function* sealChunks(
  plain: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  key: Buffer,
  aad: Buffer,
  prefix: Buffer,
  chunkSize: number,
): AsyncGenerator<Buffer> {
  let pending: Buffer = Buffer.alloc(0);
  let index = 0;
  for await (const piece of plain) {
    pending = Buffer.concat([pending, piece]);
    // strictly greater: the last chunk must be held back until we know it is last
    while (pending.length > chunkSize) {
      yield sealOne(pending.subarray(0, chunkSize), key, aad, prefix, index, false);
      index += 1;
      pending = pending.subarray(chunkSize);
    }
  }
  yield sealOne(pending, key, aad, prefix, index, true);
}

export async function* openChunks(
  reader: ByteReader,
  key: Buffer,
  aad: Buffer,
  prefix: Buffer,
  chunkSize: number,
): AsyncGenerator<Buffer> {
  for (let index = 0; ; index += 1) {
    const length = (await reader.read(4)).readUInt32BE(0);
    if (length < TAG_BYTES || length > chunkSize + TAG_BYTES) {
      throw new ArchiveError("malformed", "chunk length out of range");
    }
    const body = await reader.read(length);
    const last = await reader.isDone();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce(prefix, index, last), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(body.subarray(length - TAG_BYTES));
    let plain: Buffer;
    try {
      plain = Buffer.concat([decipher.update(body.subarray(0, length - TAG_BYTES)), decipher.final()]);
    } catch {
      // wrong passphrase, damage, truncation, reordering: one answer on purpose
      throw new ArchiveError("authentication-failed", "wrong passphrase or damaged archive");
    }
    yield plain;
    if (last) return;
  }
}
