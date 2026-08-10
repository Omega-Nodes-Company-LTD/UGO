/**
 * Pure redaction helpers for GDPR erasure (PROGETTO §7).
 * No I/O: the only part of the erasure pipeline that is unit-testable
 * (TESTING_PLAYBOOK §1).
 */

export const REDACTION = "[rimosso]";

/**
 * Case-insensitive matcher over a display name and its aliases.
 * `\b` is unreliable next to accented letters, so word boundaries are
 * expressed as "not a letter or digit" in Unicode terms.
 */
export function buildRedactor(terms: readonly string[]): (value: string) => string {
  const cleaned = terms
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .sort((a, b) => b.length - a.length); // longest first: "Mario Rossi" before "Mario"
  if (cleaned.length === 0) return (value) => value;
  const escaped = cleaned.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped.join("|")})(?=[^\\p{L}\\p{N}]|$)`,
    "giu",
  );
  return (value) => value.replace(pattern, (_match, prefix: string) => `${prefix}${REDACTION}`);
}

/** Recursively redact every string inside a jsonb payload. */
export function redactJson(value: unknown, redact: (text: string) => string): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactJson(item, redact));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, redactJson(inner, redact)]),
    );
  }
  return value;
}
