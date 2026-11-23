import { z } from "zod";
import { TABLE_NAME } from "./format.js";

/**
 * What an archive says about itself. It sits inside the encrypted stream, so
 * it is only readable after authentication — but it is still *untrusted
 * input* (whoever knows the passphrase can write it), so every field has a
 * bound.
 *
 * Forward compatibility rule (docs/FORMATO_UGOSOUL.md §6): objects are NOT
 * strict. A reader of the same major ignores fields a later minor added; a new
 * major is a different layout and is refused up front.
 */
export const omissionSchema = z.object({
  /** free text on purpose: a new category must not need a new major version */
  category: z.string().min(1).max(64),
  table: z.string().regex(TABLE_NAME).optional(),
  /** set when only one column of `table` stays behind (e.g. a key, a vector) */
  column: z.string().regex(TABLE_NAME).optional(),
  reason: z.string().min(1).max(500),
  count: z.number().int().nonnegative(),
});

export const soulManifestSchema = z.object({
  kind: z.literal("ugo-soul"),
  formatVersion: z.object({
    major: z.number().int().min(1),
    minor: z.number().int().min(0),
  }),
  createdAt: z.iso.datetime(),
  generator: z.object({ name: z.string().min(1).max(64), version: z.string().min(1).max(64) }),
  /** ADR-132 §1: a move (default) or a declared fork */
  mode: z.enum(["trasloco", "copia"]),
  source: z.object({
    /** last migration tag of the exporting database, e.g. `0062_la-cartolina` */
    schemaVersion: z.string().min(1).max(128),
    embeddingModel: z.string().min(1).max(128),
    embeddingDimensions: z.number().int().positive(),
  }),
  gosinoIds: z.array(z.uuid()).min(1).max(64),
  /**
   * Everything that did not travel, and why. Required even when empty: a
   * manifest that stays silent about omissions is the defect ADR-089 closed.
   */
  omissions: z.array(omissionSchema).max(256),
});
export type SoulManifest = z.infer<typeof soulManifestSchema>;

export const integrityFileSchema = z.object({
  name: z.string().min(1).max(128),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  /** number of `\n`-terminated lines */
  rows: z.number().int().nonnegative(),
});
export const integritySchema = z.object({ files: z.array(integrityFileSchema).max(1024) });
export type IntegrityFile = z.infer<typeof integrityFileSchema>;
export type Integrity = z.infer<typeof integritySchema>;

export interface RuntimeCompat {
  supportedMajor: number;
  supportedMinor: number;
  /** the importing database's last migration tag */
  schemaVersion: string;
  embeddingModel: string;
}

export type CompatWarning = "newer-minor" | "older-schema" | "embedding-model-differs";
export type CompatRefusal =
  | "unsupported-format-major"
  | "archive-from-newer-schema"
  | "unreadable-schema-version";
export type Compatibility =
  | { ok: true; warnings: CompatWarning[] }
  | { ok: false; reason: CompatRefusal; message: string };

/** `0062_la-cartolina` → 62 */
function migrationNumber(tag: string): number | undefined {
  const match = /^(\d{1,6})_/u.exec(tag);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * Can this runtime take this archive? Pure, so the import screen and the
 * tests ask the same question. Older archives are fine (missing columns get
 * defaults at import); newer ones are not (we cannot invent what a newer
 * schema stores) — the person is told to update first.
 */
export function assessCompatibility(manifest: SoulManifest, runtime: RuntimeCompat): Compatibility {
  if (manifest.formatVersion.major !== runtime.supportedMajor) {
    return {
      ok: false,
      reason: "unsupported-format-major",
      message: "questo archivio usa un formato che questa versione non conosce",
    };
  }
  const theirs = migrationNumber(manifest.source.schemaVersion);
  const ours = migrationNumber(runtime.schemaVersion);
  if (theirs === undefined || ours === undefined) {
    return {
      ok: false,
      reason: "unreadable-schema-version",
      message: "la versione dei dati dell'archivio non si legge: meglio non indovinare",
    };
  }
  if (theirs > ours) {
    return {
      ok: false,
      reason: "archive-from-newer-schema",
      message: "l'archivio viene da una versione più recente di UGO: aggiorna prima UGO Casa",
    };
  }
  const warnings: CompatWarning[] = [];
  if (manifest.formatVersion.minor > runtime.supportedMinor) warnings.push("newer-minor");
  if (theirs < ours) warnings.push("older-schema");
  if (manifest.source.embeddingModel !== runtime.embeddingModel) {
    warnings.push("embedding-model-differs");
  }
  return { ok: true, warnings };
}
