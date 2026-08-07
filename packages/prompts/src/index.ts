import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Identity and format rules are versioned artifacts (PROGETTO §5.5): they are
 * the two [CACHED] prompt blocks and MUST stay byte-stable within a deploy —
 * any change lands as a diff here and consciously invalidates the prompt
 * cache. Never interpolate dynamic data into these strings.
 */

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadPromptFile(name: string): string {
  return readFileSync(join(packageRoot, name), "utf8").trim();
}

let cachedIdentity: string | undefined;
let cachedRules: string | undefined;

/** Block 1 — [CACHED] identity and personality. */
export function identityPrompt(): string {
  cachedIdentity ??= loadPromptFile("identity.it.md");
  return cachedIdentity;
}

/** Block 2 — [CACHED] format rules and limits. */
export function rulesPrompt(): string {
  cachedRules ??= loadPromptFile("rules.it.md");
  return cachedRules;
}
