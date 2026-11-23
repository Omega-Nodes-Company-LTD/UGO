import { scrypt } from "node:crypto";
import { assertKdfParams, KEY_BYTES, kdfMemoryBytes, type KdfParams } from "./format.js";

/**
 * Passphrase → 256-bit key. scrypt ships with Node and with Python's hashlib,
 * so the format adds no dependency. `maxmem` is set from the validated
 * parameters, never left to the default (32 MiB would reject our own cost).
 */
export function deriveKey(secret: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  assertKdfParams(params);
  if (secret.length === 0) throw new RangeError("the secret must not be empty");
  return new Promise((resolve, reject) => {
    scrypt(
      secret.normalize("NFKC"),
      salt,
      KEY_BYTES,
      {
        N: 2 ** params.log2N,
        r: params.r,
        p: params.p,
        maxmem: kdfMemoryBytes(params) + 128 * params.r * (params.p + 2) + 4096,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
