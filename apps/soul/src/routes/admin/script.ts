import { ARCHIVE_JS } from "./script/archive.js";
import { BIRTH_JS } from "./script/birth.js";
import { CHARTS_JS } from "./script/charts.js";
import { BOOK_JS } from "./script/book.js";
import { PACK_MOOD_JS } from "./script/packMood.js";
import { CHECKINS_JS } from "./script/checkins.js";
import { CORE_JS } from "./script/core.js";
import { COUNCIL_JS } from "./script/council.js";
import { CUSTOMERS_JS } from "./script/customers.js";
import { DATA_JS } from "./script/data.js";
import { ADOPTIONS_JS } from "./script/adoptions.js";
import { DIARY_JS } from "./script/diary.js";
import { EFFICACY_JS } from "./script/efficacy.js";
import { FEEDS_JS } from "./script/feeds.js";
import { EXEMPLARS_JS } from "./script/exemplars.js";
import { GRAPH_JS } from "./script/graph.js";
import { PACK_JS } from "./script/pack.js";
import { PEDIGREE_JS } from "./script/pedigree.js";
import { PIGGYBANK_JS } from "./script/piggybank.js";
import { LIFE_JS } from "./script/life.js";
import { LISTS_JS } from "./script/lists.js";
import { PRINTS_JS } from "./script/prints.js";
import { PROPS_JS } from "./script/props.js";
import { SPARKS_JS } from "./script/sparks.js";
import { RELATIONS_JS } from "./script/relations.js";
import { ROOMS_JS } from "./script/rooms.js";
import { ROUTER_JS } from "./script/router.js";
import { TIES_JS } from "./script/ties.js";
import { CAPABILITIES_JS } from "./script/capabilities.js";
import { HOUSES_JS } from "./script/houses.js";
import { PLACE_JS } from "./script/place.js";
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
  FEEDS_JS,
  CUSTOMERS_JS,
  PROPS_JS,
  PRINTS_JS,
  CHARTS_JS,
  SPARKS_JS,
  PACK_JS,
  RELATIONS_JS,
  VOICE_JS,
  ARCHIVE_JS,
  GRAPH_JS,
  DATA_JS,
  STATUS_JS,
  PLACE_JS,
  CAPABILITIES_JS,
  HOUSES_JS,
  EXEMPLARS_JS,
  VOLITION_JS,
  CHECKINS_JS,
  BOOK_JS,
  PACK_MOOD_JS,
  EFFICACY_JS,
  COUNCIL_JS,
  BIRTH_JS,
  PEDIGREE_JS,
  PIGGYBANK_JS,
  LIFE_JS,
  DIARY_JS,
  ADOPTIONS_JS,
  LISTS_JS,
  TIES_JS,
].join("\n");
