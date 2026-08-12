import { ARCHIVE_JS } from "./script/archive.js";
import { BIRTH_JS } from "./script/birth.js";
import { CHARTS_JS } from "./script/charts.js";
import { CORE_JS } from "./script/core.js";
import { COUNCIL_JS } from "./script/council.js";
import { DATA_JS } from "./script/data.js";
import { EXEMPLARS_JS } from "./script/exemplars.js";
import { GRAPH_JS } from "./script/graph.js";
import { PACK_JS } from "./script/pack.js";
import { SPARKS_JS } from "./script/sparks.js";
import { RELATIONS_JS } from "./script/relations.js";
import { ROOMS_JS } from "./script/rooms.js";
import { ROUTER_JS } from "./script/router.js";
import { STATUS_JS } from "./script/status.js";
import { VOICE_JS } from "./script/voice.js";
import { VOLITION_JS } from "./script/volition.js";

/**
 * Panel behaviour, split by area so no single file grows past what a person
 * can read in one sitting (CLAUDE.md rule 10). Served as one script.
 *
 * Every refusal is shown as what it is: a 403 on enrollment is a protection
 * doing its job, not a malfunction, and the panel says so in those words.
 */
export const ADMIN_SCRIPT = [
  CORE_JS,
  ROUTER_JS,
  ROOMS_JS,
  CHARTS_JS,
  SPARKS_JS,
  PACK_JS,
  RELATIONS_JS,
  VOICE_JS,
  ARCHIVE_JS,
  GRAPH_JS,
  DATA_JS,
  STATUS_JS,
  EXEMPLARS_JS,
  VOLITION_JS,
  COUNCIL_JS,
  BIRTH_JS,
].join("\n");
