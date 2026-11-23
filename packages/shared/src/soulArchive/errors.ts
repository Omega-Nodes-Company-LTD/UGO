/**
 * Why an archive was refused. Codes are a stable contract: the import screen
 * maps each one to a sentence a non-technical person can act on, and tests
 * assert on the code, never on the wording.
 *
 * Messages never contain the passphrase, a key, or a byte of archive content.
 */
export type ArchiveErrorCode =
  /** the file does not start like an archive */
  | "bad-magic"
  /** a format major this reader does not know */
  | "unsupported-version"
  /** key-derivation cost outside what this reader is willing to spend */
  | "bad-kdf-params"
  /** wrong passphrase *or* any modification: deliberately indistinguishable */
  | "authentication-failed"
  /** the file ends before the archive does */
  | "truncated"
  /** structurally wrong: framing, manifest, ordering, duplicates, trailing bytes */
  | "malformed"
  /** bigger than the limits the caller allowed */
  | "limit-exceeded"
  /** an entry name outside the whitelist */
  | "bad-entry-name"
  /** the integrity record does not match what was actually read */
  | "integrity-mismatch";

export class ArchiveError extends Error {
  public readonly code: ArchiveErrorCode;

  public constructor(code: ArchiveErrorCode, message: string) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
  }
}
