import { randomBytes } from "node:crypto";

/**
 * The recovery code: what a person writes on paper and types back months
 * later. Crockford base32 (no I, L, O, U — the letters that look like digits
 * or spell words), 24 characters = 120 random bits, shown as six groups of
 * four. At that entropy scrypt is a courtesy, not the defence.
 *
 * There is no recovery from losing it: by design, the same trade-off as the
 * data key (il-confidente-inviolabile.md).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_CHARS = 24;

export function generateRecoveryCode(): string {
  const bytes = randomBytes(15);
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let out = "";
  for (let i = CODE_CHARS - 1; i >= 0; i -= 1) {
    out += ALPHABET.charAt(Number((bits >> BigInt(i * 5)) & 31n));
  }
  return out.replace(/(.{4})(?=.)/gu, "$1-");
}

/** Canonical form of a recovery code, or `undefined` if the input is not one. */
export function normalizeRecoveryCode(input: string): string | undefined {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/gu, "")
    .replace(/O/gu, "0")
    .replace(/[IL]/gu, "1");
  if (cleaned.length !== CODE_CHARS) return undefined;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return undefined;
  return cleaned;
}

/**
 * What actually gets fed to the key derivation. A recovery code is reduced to
 * its canonical form so that "abcd efgh…" and "ABCD-EFGH-…" open the same
 * file; any other text is a passphrase the person chose, used as typed (after
 * Unicode normalisation in the KDF). Writer and reader both go through here.
 */
export function canonicalSecret(input: string): string {
  return normalizeRecoveryCode(input) ?? input.normalize("NFKC");
}
