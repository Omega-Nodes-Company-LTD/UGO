import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption at rest for messages/transcripts
 * (PROGETTO §7, SECURITY_COMPLIANCE §3): AES-256-GCM with the key kept
 * SEPARATE from the database (env UGO_DATA_KEY, 32 bytes base64).
 *
 * Wire format (stable contract, needed by the Python jobs too):
 *   "v1:" + base64( iv[12] || ciphertext || authTag[16] )
 * Rotating the key only requires re-encrypting rows, never code changes.
 */

const VERSION_PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function parseDataKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`UGO_DATA_KEY must decode to ${String(KEY_BYTES)} bytes (AES-256)`);
  }
  return key;
}

export function encryptText(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const packed = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
  return VERSION_PREFIX + packed.toString("base64");
}

export function decryptText(payload: string, key: Buffer): string {
  if (!payload.startsWith(VERSION_PREFIX)) {
    throw new Error("unknown ciphertext version");
  }
  const packed = Buffer.from(payload.slice(VERSION_PREFIX.length), "base64");
  if (packed.length < IV_BYTES + TAG_BYTES) {
    throw new Error("ciphertext too short");
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(packed.length - TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES, packed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncrypted(payload: string): boolean {
  return payload.startsWith(VERSION_PREFIX);
}
