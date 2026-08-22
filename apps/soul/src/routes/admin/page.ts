import { CUSTOMER_PAGES } from "./page/customers.js";
import { GOSINO_PAGES, DIAL_STYLES } from "./page/gosino.js";
import { PEDIGREE_STYLES } from "./script/pedigree.js";
import { PIGGYBANK_STYLES } from "./script/piggybank.js";
import { ACCOUNT_PAGES } from "./page/account.js";
import { DIAGNOSTICS_PAGE, DIAGNOSTICS_STYLES } from "./page/diagnostics.js";
import { JOURNAL_PAGES, JOURNAL_STYLES } from "./page/journal.js";
import { ADMIN_SHELL_BOTTOM, ADMIN_SHELL_TOP, GATE_STYLES } from "./page/shell.js";
import { ADMIN_STYLES } from "./page/styles.js";
import { ADMIN_DATA_STYLES } from "./page/stylesData.js";

/**
 * The operator panel (served at /admin). No build step, no dependencies.
 *
 * It is a tool, not a document: the summary comes before the detail, state is
 * encoded in shape as well as number, and every reading names the creature it
 * belongs to — which is what forced the two-level shape of ADR-035, because
 * "come sta" is a question about somebody and a flat page has nowhere to put
 * the somebody.
 *
 * Assembled from parts so no file grows past what a person reads in one
 * sitting (CLAUDE.md rule 10). The token's storage is decided by the owner at
 * the door, not by this file — see `core.ts`.
 */
export const ADMIN_PAGE = [
  ADMIN_SHELL_TOP.replace(
    "__STYLES__",
    [
      ADMIN_STYLES,
      ADMIN_DATA_STYLES,
      GATE_STYLES,
      JOURNAL_STYLES,
      DIAL_STYLES,
      PEDIGREE_STYLES,
      PIGGYBANK_STYLES,
      DIAGNOSTICS_STYLES,
    ].join("\n"),
  ),
  ACCOUNT_PAGES,
  DIAGNOSTICS_PAGE,
  JOURNAL_PAGES,
  CUSTOMER_PAGES,
  GOSINO_PAGES,
  ADMIN_SHELL_BOTTOM,
].join("\n");
