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

/**
 * Did UGO just hear himself? The microphone is next to the speaker, so the
 * transcript of his own reply comes back word for word — and answering it
 * would start a conversation with nobody, billed to the owner.
 */
export function isEcho(text: string, spoken: string | undefined): boolean {
  if (spoken === undefined || spoken === "") return false;
  const heard = words(text);
  if (heard.length === 0) return false;
  const said = new Set(words(spoken));
  if (said.size === 0) return false;
  const shared = heard.filter((word) => said.has(word)).length;
  return shared / heard.length >= ECHO_OVERLAP;
}

export interface HeardContext {
  /** the last thing UGO said out loud, if any */
  spoken?: string | undefined;
}

/** The one decision: does this reach soul, or die here? */
export function worthSending(text: string, context: HeardContext = {}): boolean {
  const cleaned = normalize(text);
  if (cleaned.length < MIN_CHARS) return false;
  if (words(cleaned).length < MIN_WORDS) return false;
  return !isEcho(cleaned, context.spoken);
}
