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

/**
 * Block 2 for the `ticket` channel (ADR-052): the reception's rules replace
 * the house rules when a gosino talks to a customer. Same discipline as the
 * other two blocks — versioned file, byte-stable, never interpolated.
 */
export function receptionPrompt(locale: string = DEFAULT_LOCALE): string {
  return loadPromptFile("reception", locale);
}

/**
 * I contesti in cui UGO riassume qualcosa (backlog gruppo 2).
 *
 * Sono tre lavori diversi e per mesi ne è esistito uno solo, scritto a mano
 * dentro `meetingsService` — cioè un prompt di produzione che nessun test
 * poteva vedere e nessuna traduzione poteva raggiungere. Riassumere una
 * riunione (decisioni e action item, terza persona), lo stato di un cliente
 * (cosa è aperto, cosa aspetta) e una settimana di casa (a chi ci vive) non
 * sono lo stesso testo con parole diverse: cambiano il destinatario e cosa
 * conta lasciare fuori.
 *
 * Stessa disciplina degli altri blocchi: file versionato, mai interpolato, e
 * una lingua per file.
 */
export type SummaryContext = "riunione" | "cliente" | "famiglia";

/**
 * Un file solo con tre sezioni invece di tre file: sono tre righe, e tenerle
 * vicine è l'unico modo per accorgersi che stanno divergendo.
 */
export function summaryPrompt(
  context: SummaryContext,
  locale: string = DEFAULT_LOCALE,
): string {
  const document = loadPromptFile("summaries", locale);
  const sections = document.split(/^# /mu).map((block) => block.trim());
  const wanted = sections.find((block) => block.startsWith(context));
  if (wanted === undefined) throw new Error(`summary prompt "${context}" missing for ${locale}`);
  return wanted.slice(context.length).trim();
}
