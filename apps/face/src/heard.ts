/**
 * What is worth sending to soul, now that the face listens all the time.
 *
 * Two things go wrong the moment you stop requiring a tap, and both cost real
 * money: UGO hears his own voice and answers himself in a loop, and every
 * "eh", "mm" and half-cough becomes a paid conversation turn.
 *
 * Pure, so both are testable without a microphone.
 */

/** Below this, it is a noise, not a sentence. */
export const MIN_WORDS = 2;
export const MIN_CHARS = 4;
/** How much overlap with what UGO just said counts as hearing himself. */
export const ECHO_OVERLAP = 0.6;
/**
 * A contiguous run of words this long, shared with a recent sentence of his
 * and covering at least half of what was heard, is his own voice coming back.
 *
 * The overlap ratio alone is not enough: the recognizer hears UGO's
 * pitched-up voice and garbles half the words («Esplorare il giardino» came
 * back as «questi rari in giardino»), so exact-word overlap lands under the
 * threshold while the un-garbled tail still matches word for word, in order.
 * Order is the one thing garbling does not fabricate. Seen in production
 * (2026-08-17): Silvio answered his own spoken desire.
 */
export const ECHO_RUN = 3;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  const cleaned = normalize(text);
  return cleaned === "" ? [] : cleaned.split(" ");
}

/** Longest run of consecutive words the two sentences share, in order. */
function longestSharedRun(heard: string[], said: string[]): number {
  let best = 0;
  for (let start = 0; start < heard.length; start += 1) {
    for (let from = 0; from < said.length; from += 1) {
      let length = 0;
      while (
        start + length < heard.length &&
        from + length < said.length &&
        heard[start + length] === said[from + length]
      ) {
        length += 1;
      }
      if (length > best) best = length;
    }
  }
  return best;
}

/**
 * Did UGO just hear himself? The microphone is next to the speaker, so the
 * transcript of his own reply comes back — word for word when the recognizer
 * is lucky, garbled when it is not — and answering it would start a
 * conversation with nobody, billed to the owner.
 *
 * Accepts the last few spoken sentences, not just one: a slow recognizer can
 * finalize the echo of a sentence after UGO has already said the next one.
 */
export function isEcho(text: string, spoken: string | readonly string[] | undefined): boolean {
  const sentences = typeof spoken === "string" ? [spoken] : (spoken ?? []);
  const heard = words(text);
  if (heard.length === 0) return false;
  for (const sentence of sentences) {
    const saidList = words(sentence);
    if (saidList.length === 0) continue;
    const said = new Set(saidList);
    const shared = heard.filter((word) => said.has(word)).length;
    if (shared / heard.length >= ECHO_OVERLAP) return true;
    const run = longestSharedRun(heard, saidList);
    if (run >= ECHO_RUN && run * 2 >= heard.length) return true;
  }
  return false;
}

export interface HeardContext {
  /** the last few things UGO said out loud, newest last, if any */
  spoken?: string | readonly string[] | undefined;
}

/** The one decision: does this reach soul, or die here? */
export function worthSending(text: string, context: HeardContext = {}): boolean {
  const cleaned = normalize(text);
  if (cleaned.length < MIN_CHARS) return false;
  if (words(cleaned).length < MIN_WORDS) return false;
  return !isEcho(cleaned, context.spoken);
}
