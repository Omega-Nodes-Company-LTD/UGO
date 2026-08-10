import { ARCHIVE_JS } from "./script/archive.js";
import { CORE_JS } from "./script/core.js";
import { DATA_JS } from "./script/data.js";
import { PACK_JS } from "./script/pack.js";
import { RELATIONS_JS } from "./script/relations.js";
import { STATUS_JS } from "./script/status.js";
import { VOICE_JS } from "./script/voice.js";

/**
 * Panel behaviour, split by area so no single file grows past what a person
 * can read in one sitting (CLAUDE.md rule 10). Served as one script.
 *
 * Every refusal is shown as what it is: a 403 on enrollment is a protection
 * doing its job, not a malfunction, and the panel says so in those words.
 */
export const ADMIN_SCRIPT = [
  CORE_JS,
  PACK_JS,
  RELATIONS_JS,
  VOICE_JS,
  ARCHIVE_JS,
  DATA_JS,
  STATUS_JS,
].join("\n");
