import { decryptText } from "@ugo/shared";
import type { TablePolicy } from "./policy.js";

/**
 * Turning stored rows into archive rows: ciphertext columns are written
 * **decrypted** (the archive is re-encrypted as a whole, under the person's
 * passphrase, and the importer re-encrypts under the *local* keys — so the
 * hosting installation's keys never need to travel).
 *
 * Two ways to get this wrong, and both end the export instead of degrading:
 *
 *  - a declared ciphertext column that no key opens → `UndecryptableError`.
 *    ADR-089's export writes a "[non decifrabile]" placeholder, fine for a
 *    human reading a file; for an archive that someone will *restore from* a
 *    placeholder would silently replace a memory with a sentence.
 *  - ciphertext sitting in a column the policy calls plain →
 *    `StrayCiphertextError`. It would travel as opaque base64 and be
 *    imported as if it were text.
 *
 * Neither error carries a value, a row's content or a key: the table, the
 * column and (for the first) the row id are enough to find the problem.
 */

/** iv(12) + tag(16) = 28 bytes minimum → 38 base64 characters + padding */
const CIPHERTEXT = /^v1:[A-Za-z0-9+/]{38,}={0,2}$/u;

export function looksEncrypted(value: string): boolean {
  return CIPHERTEXT.test(value);
}

export class UndecryptableError extends Error {
  public constructor(
    public readonly table: string,
    public readonly column: string,
    public readonly rowId: string | undefined,
  ) {
    super(`${table}.${column}: no key opens this value`);
    this.name = "UndecryptableError";
  }
}

export class StrayCiphertextError extends Error {
  public constructor(
    public readonly table: string,
    public readonly column: string,
  ) {
    super(`${table}.${column}: ciphertext in a column the policy treats as plain`);
    this.name = "StrayCiphertextError";
  }
}

/** The keys a value might have been written under: master, house, creature. */
export class KeyRing {
  private readonly keys: readonly Buffer[];

  public constructor(keys: readonly Buffer[]) {
    if (keys.length === 0) throw new RangeError("a key ring needs at least one key");
    this.keys = keys;
  }

  public open(value: string): string | undefined {
    for (const key of this.keys) {
      try {
        return decryptText(value, key);
      } catch {
        // wrong key for this value: try the next
      }
    }
    return undefined;
  }
}

type Row = Record<string, unknown>;

/** Does any string inside this JSON value decrypt? (bounded depth: jsonb is shallow here) */
function hasStrayCiphertext(value: unknown, ring: KeyRing, depth = 0): boolean {
  if (typeof value === "string") return looksEncrypted(value) && ring.open(value) !== undefined;
  if (depth >= 4 || value === null || typeof value !== "object") return false;
  const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => hasStrayCiphertext(child, ring, depth + 1));
}

export function openRow(table: string, policy: TablePolicy, ring: KeyRing, row: Row): Row {
  const encrypted = new Set(policy.encrypted);
  const out: Row = {};
  for (const [column, value] of Object.entries(row)) {
    if (encrypted.has(column)) {
      if (typeof value === "string" && looksEncrypted(value)) {
        const plain = ring.open(value);
        if (plain === undefined) {
          const id = row.id;
          throw new UndecryptableError(table, column, typeof id === "string" ? id : undefined);
        }
        out[column] = plain;
      } else {
        out[column] = value; // written in the clear on purpose (ADR-091: memories)
      }
    } else {
      if (hasStrayCiphertext(value, ring)) throw new StrayCiphertextError(table, column);
      out[column] = value;
    }
  }
  return out;
}
