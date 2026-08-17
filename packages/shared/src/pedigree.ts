import { createHash, createPublicKey, sign, verify } from "node:crypto";

/**
 * The pedigree, step one (ADR-070): the birth certificate signed by both
 * parents.
 *
 * Nothing is stored as a document — the canonical form is *rebuilt* from the
 * rows, so there can never be two truths (the paper and the facts) that
 * disagree. What is stored is the signature and the key that made it, which
 * is what keeps a certificate verifiable offline, by anybody, forever: a
 * pedigree that needs our registry to be believed is not a pedigree.
 */

export interface BirthCertificate {
  childId: string;
  /** SHA-256 of the child's genome, so a tampered genome breaks the signature */
  genomeHash: string;
  /** every parent, sorted: a signature must not depend on argument order */
  parentIds: readonly string[];
  /** the child's birth instant, ISO-8601 */
  bornAt: string;
  generation: number;
}

/**
 * The genome's fingerprint. Keys are sorted and values fixed to 6 decimals:
 * jsonb round-trips do not promise key order, and a float that comes back as
 * 0.30000000000000004 must not invalidate a genealogy.
 */
export function genomeHash(genome: unknown): string {
  return createHash("sha256").update(canonicalJson(genome), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(6) : "null";
  // undefined and functions stringify to undefined; the caller filters them
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Fixed field order by hand: a signature must not depend on "in practice". */
function canonical(certificate: BirthCertificate): Buffer {
  return Buffer.from(
    JSON.stringify([
      certificate.childId,
      certificate.genomeHash,
      [...certificate.parentIds].sort(),
      certificate.bornAt,
      certificate.generation,
    ]),
    "utf8",
  );
}

export function signBirth(certificate: BirthCertificate, signingPrivateKey: Buffer): Buffer {
  return sign(null, canonical(certificate), {
    key: signingPrivateKey,
    format: "der",
    type: "pkcs8",
  });
}

/**
 * Does this signature really say that this parent's key attested this birth?
 * False on any malformed input — a key that cannot be parsed is not a half
 * trusted key.
 */
export function verifyBirth(
  certificate: BirthCertificate,
  signature: Buffer,
  parentPublicKey: Buffer,
): boolean {
  try {
    const key = createPublicKey({ key: parentPublicKey, format: "der", type: "spki" });
    return verify(null, canonical(certificate), key, signature);
  } catch {
    return false;
  }
}

/**
 * A founder has no parents, and a birth from before ADR-070 has no signature:
 * neither is a forgery, and calling them invalid would be a worse lie than
 * saying nothing. Only `invalid` means somebody touched the database.
 */
export type LineageVerdict = "valid" | "invalid" | "unsigned";

export function verdictFor(
  certificate: BirthCertificate,
  signature: Buffer | null | undefined,
  parentPublicKey: Buffer | null | undefined,
): LineageVerdict {
  if (signature == null || parentPublicKey == null) return "unsigned";
  return verifyBirth(certificate, signature, parentPublicKey) ? "valid" : "invalid";
}
