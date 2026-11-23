/**
 * What goes into a `.ugosoul` and what stays behind (ADR-132, MKT-10.3).
 *
 * This is the **declared** half of the export. The other half is the database
 * itself: tables and columns are discovered at export time, and anything the
 * policy does not mention stops the export (`UnclassifiedError`) — the same
 * discipline as ADR-089's coverage test, applied to columns as well. A new
 * table or a new `bytea` column cannot reach a customer's archive by being
 * forgotten.
 *
 * Every omission carries a category and a reason in plain Italian: the manifest
 * copies them, and the export screen shows them to the person. Nothing leaves
 * out of sight.
 */
export type OmissionCategory =
  /** faces and voices: ADR-016/057, never exported */
  | "biometrics"
  /** hashes of tokens, pairing codes, login links */
  | "credentials"
  /** the keys that wrap data on the hosting installation */
  | "data-keys"
  /** the creature's own signing keys (decision pending: ADR-132 §«Ancora aperto» 8) */
  | "identity-keys"
  /** breeding / founder rights: given from the command line, never carried (ADR-081) */
  | "authorizations"
  /** money and sales on the hosting side: budgets, ledger, listings, adoptions */
  | "hosted-economics"
  /** ties to the hosting installation: a device id, a bucket object */
  | "hosted-binding"
  /** files in object storage: the row travels, the bytes do not (yet) */
  | "media-bytes"
  /** cards and ties between houses: they need the other house */
  | "peer-exchange"
  /** customers of the reception: other people's business, not the creature's life */
  | "business-data"
  /** the hosting installation's security trail */
  | "security-log"
  /** vectors and indexes the importer rebuilds itself */
  | "recomputable"
  /** public content that can be fetched again */
  | "refetchable";

export interface Why {
  category: OmissionCategory;
  /** plain Italian, shown to the person exporting */
  reason: string;
}

export interface TablePolicy {
  /** the whole table stays behind */
  omit?: Why;
  /**
   * Columns that tie a row to a house when the table has no plain
   * `account_id` (e.g. `from_account_id` / `to_account_id` on ties and
   * parcels). A row belongs to the house if ANY of them matches.
   */
  accountColumns?: readonly string[];
  /** columns that stay behind inside an exported table */
  drop?: Readonly<Record<string, Why>>;
  /** text columns that hold ciphertext: written to the archive decrypted */
  encrypted?: readonly string[];
  /**
   * Columns in `encrypted` that go back **in the clear** when imported.
   * `memories.text` is the one: ADR-091 writes memories plain because the
   * lexical search index (ADR-022) depends on it. Everything else in
   * `encrypted` is re-encrypted under the importing installation's key.
   */
  writtenPlain?: readonly string[];
  /**
   * A vector the importer recomputes from a text column (the archive never
   * carries embeddings: they are model-specific and rebuilt). `required` is
   * true when the vector column is NOT NULL, so the row cannot exist without it.
   */
  embed?: { vector: string; from: string; required: boolean };
  /** `bytea` columns that are public data (signatures, public keys): written as hex */
  publicBytes?: readonly string[];
  /**
   * A column pointing at a file that does not travel. Rows are exported; the
   * non-null ones are counted as `media-bytes` omissions.
   */
  mediaColumn?: string;
}

export class UnclassifiedError extends Error {
  public constructor(what: string) {
    super(`${what} is not classified in the export policy`);
    this.name = "UnclassifiedError";
  }
}

export const REBUILT_ON_IMPORT = "si ricalcolano all'import con lo stesso modello";
