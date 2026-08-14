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

/**
 * ADR-050: una cache per lingua, mai un'interpolazione.
 *
 * Tradurre non significa infilare la lingua in un prompt — sarebbe dato
 * variabile in un blocco cached (regola 2) e in piu' non funzionerebbe, perche'
 * la personalita' di UGO *e'* scritta in italiano e chiedere a un prompt
 * italiano di rispondere in un'altra lingua produce una traduzione, non un
 * carattere. Significa N file e N cache distinte, memoizzate per locale qui
 * sotto: due case in due lingue pagano due `cache_write` e poi ognuna legge la
 * propria.
 */
export const DEFAULT_LOCALE = "it-IT";

/** `it-IT` -> `it`: i file portano la lingua, non la variante regionale. */
function languageOf(locale: string): string {
  return (locale.split("-")[0] ?? "").toLowerCase();
}

const cache = new Map<string, string>();

/**
 * Il file della lingua chiesta, o quello italiano.
 *
 * Il ripiego e' voluto e non e' mezzo lavoro: la differenza e' fra una casa in
 * `en-GB` che parla italiano — funzionante, e onesta su cio' che non ha — e una
 * che non parte. Aggiungere una lingua e' aggiungere due file, senza toccare
 * una riga di codice.
 */
function loadPromptFile(kind: string, locale: string): string {
  const key = `${kind}.${locale}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const candidates = [languageOf(locale), languageOf(DEFAULT_LOCALE)];
  for (const language of candidates) {
    try {
      const text = readFileSync(join(packageRoot, `${kind}.${language}.md`), "utf8").trim();
      cache.set(key, text);
      return text;
    } catch {
      // la lingua non e' ancora stata scritta: si prova l'italiano
    }
  }
  throw new Error(`prompt "${kind}" missing for ${locale} and for ${DEFAULT_LOCALE}`);
}

/** Block 1 — [CACHED] identity and personality. */
export function identityPrompt(locale: string = DEFAULT_LOCALE): string {
  return loadPromptFile("identity", locale);
}

/** Block 2 — [CACHED] format rules and limits. */
export function rulesPrompt(locale: string = DEFAULT_LOCALE): string {
  return loadPromptFile("rules", locale);
}
