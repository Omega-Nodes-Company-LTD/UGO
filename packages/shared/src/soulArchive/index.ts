export { ArchiveError, type ArchiveErrorCode } from "./errors.js";
export {
  DEFAULT_KDF,
  DEFAULT_LIMITS,
  FORMAT_MAJOR,
  FORMAT_MINOR,
  type KdfParams,
  type ReadLimits,
} from "./format.js";
export {
  assessCompatibility,
  integritySchema,
  omissionSchema,
  soulManifestSchema,
  type CompatRefusal,
  type CompatWarning,
  type Compatibility,
  type Integrity,
  type IntegrityFile,
  type RuntimeCompat,
  type SoulManifest,
} from "./manifest.js";
export { canonicalSecret, generateRecoveryCode, normalizeRecoveryCode } from "./recoveryCode.js";
export { openSoulArchive, type SoulArchive, type TableStream } from "./reader.js";
export { writeSoulArchive, type TableInput, type WriteOptions } from "./writer.js";
