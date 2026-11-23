/**
 * Why an import was refused (ADR-132, MKT-10.5). Codes are a stable contract:
 * the setup page maps each to a sentence for a person, and tests assert on the
 * code. Messages never carry a row, a key or the passphrase.
 *
 * Distinct from `ArchiveError` (@ugo/shared): that one says the *file* is
 * wrong; this one says the file is fine but cannot be loaded *here*.
 */
export type ImportRefusalCode =
  /** format or schema version this installation cannot take (`assessCompatibility`) */
  | "incompatible"
  /** the target already has a house: an import fills an empty installation, it never merges */
  | "target-not-empty"
  /** the archive has a table that has no business being in one */
  | "unknown-table"
  /** tables arrive in an order the foreign keys cannot follow */
  | "table-order"
  /** rows that cannot exist without a vector, and nothing to compute it with */
  | "needs-embedder"
  /** the archive carries no house row */
  | "no-house"
  /** what was written does not add up to what the archive declares */
  | "mismatch";

export class ImportRefusal extends Error {
  public constructor(
    public readonly code: ImportRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportRefusal";
  }
}
