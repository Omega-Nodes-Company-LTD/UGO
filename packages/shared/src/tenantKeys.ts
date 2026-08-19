import { randomBytes } from "node:crypto";
import { decryptBytes, encryptBytes } from "./crypto.js";

/**
 * One data key per house (ADR-019).
 *
 * `UGO_DATA_KEY` stops being *the* key and becomes the master key (KEK) that
 * wraps each house's own data key (DEK). Everything a family owns is encrypted
 * with its DEK and nothing else, which buys two things a single key cannot:
 *
 *  - reading one family's backup tells you nothing about the others;
 *  - erasure becomes demonstrable. Destroy the wrapped DEK and the rows are
 *    unreadable by anyone, forever — no careful anonymisation pass to trust.
 *
 * What it does NOT buy: protection from root on the live machine, which holds
 * the KEK in its environment. ADR-017 said so and still says so.
 */

const DATA_KEY_BYTES = 32;

export function generateDataKey(): Buffer {
  return randomBytes(DATA_KEY_BYTES);
}

/** Wrap a house's data key with the master key, for storage in `accounts`. */
export function wrapDataKey(dataKey: Buffer, masterKey: Buffer): Buffer {
  if (dataKey.length !== DATA_KEY_BYTES) {
    throw new Error(`a data key must be ${String(DATA_KEY_BYTES)} bytes (AES-256)`);
  }
  return encryptBytes(dataKey, masterKey);
}

export function unwrapDataKey(wrapped: Buffer, masterKey: Buffer): Buffer {
  const dataKey = decryptBytes(wrapped, masterKey);
  if (dataKey.length !== DATA_KEY_BYTES) {
    throw new Error("unwrapped data key has the wrong length");
  }
  return dataKey;
}
