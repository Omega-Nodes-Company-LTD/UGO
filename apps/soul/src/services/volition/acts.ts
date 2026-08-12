import type { PressureId } from "./pressures.js";

/**
 * The act repertoire — DATA.
 *
 * This is the piece that turns a weighted dice roll into a decision: every act
 * declares what it is *for*. Without an expected effect there is nothing to
 * compare, and without comparison there is no choosing.
 *
 * Note what is nearly free and what is not. Almost everything here costs zero
 * tokens and no network: a grunt, an ear flick, coming over to where you are.
 * Only `askQuestion` invents words, and it does it on the local model
 * (Ollama), never on the paid provider — an initiative must never be able to
 * spend the day's budget by itself.
 */

export type ActKind =
  | "gesture" // the body performs it; nothing is said
  | "glyph" // the LEDs across the room
  | "speakDesire" // says a desire the dream already wrote: zero tokens
  | "askQuestion" // invents a question on the local model
  | "askOut"; // asks to be taken out (ADR-030)

export interface Act {
  id: string;
  it: string;
  kind: ActKind;
  /** which pressures it discharges, and what fraction of each */
  relieves: Partial<Record<PressureId, number>>;
  /** how much of the human's attention it demands, 0..1 */
  intrusive: number;
  /** minutes before the same act may repeat */
  cooldownMin: number;
  /** a body must be connected to see or hear it */
  needsBody?: boolean;
  /** there must be a pending desire */
  needsDesire?: boolean;
  /** the local model must answer */
  needsLocalModel?: boolean;
  /** for `gesture` and `glyph`: which one */
  payload?: string;
}

/**
 * Ordered cheapest-first only for readability; the decision does not read the
 * order, it reads the numbers.
 */
export const ACTS: readonly Act[] = [
  {
    id: "lookOver",
    it: "ti guarda",
    kind: "gesture",
    payload: "peer",
    relieves: { boredom: 0.18, loneliness: 0.12 },
    intrusive: 0.05,
    cooldownMin: 7,
    needsBody: true,
  },
  {
    id: "earPerk",
    it: "drizza le orecchie verso di te",
    kind: "gesture",
    payload: "perkUp",
    relieves: { boredom: 0.15, curiosity: 0.1 },
    intrusive: 0.05,
    cooldownMin: 9,
    needsBody: true,
  },
  {
    id: "comeCloser",
    it: "si sporge verso di te",
    kind: "gesture",
    payload: "leanIn",
    relieves: { loneliness: 0.3, worry: 0.3, boredom: 0.2 },
    intrusive: 0.15,
    cooldownMin: 12,
    needsBody: true,
  },
  {
    id: "nudge",
    it: "grugnisce per farsi notare",
    kind: "gesture",
    payload: "happyGrunt",
    relieves: { loneliness: 0.35, boredom: 0.35 },
    intrusive: 0.3,
    cooldownMin: 15,
    needsBody: true,
  },
  {
    id: "sigh",
    it: "sospira, forte abbastanza da sentirsi",
    kind: "gesture",
    payload: "sighBored",
    relieves: { boredom: 0.3, loneliness: 0.2 },
    intrusive: 0.2,
    cooldownMin: 14,
    needsBody: true,
  },
  {
    id: "callFromAcross",
    it: "chiama con le luci",
    kind: "glyph",
    payload: "alert",
    // the one act that works when he cannot be seen: the Glyph is readable
    // from the other side of the room (§4.1)
    relieves: { loneliness: 0.45 },
    intrusive: 0.4,
    cooldownMin: 25,
  },
  {
    id: "sayDesire",
    it: "tira fuori quello che si era segnato",
    kind: "speakDesire",
    relieves: { unspoken: 1, curiosity: 0.35, boredom: 0.5, loneliness: 0.4 },
    intrusive: 0.6,
    cooldownMin: 20,
    needsBody: true,
    needsDesire: true,
  },
  {
    id: "askToGoOut",
    it: "chiede di uscire",
    kind: "askOut",
    // nothing else discharges `outing`: only actually going out does, and this
    // is the one act that can make that happen
    relieves: { outing: 0.55, boredom: 0.5, loneliness: 0.3 },
    intrusive: 0.65,
    cooldownMin: 180,
    needsBody: true,
  },
  {
    id: "askQuestion",
    it: "si fa venire una domanda e te la fa",
    kind: "askQuestion",
    relieves: { curiosity: 1, boredom: 0.6, loneliness: 0.5 },
    intrusive: 0.7,
    cooldownMin: 45,
    needsBody: true,
    needsLocalModel: true,
  },
];

export const ACT_BY_ID: ReadonlyMap<string, Act> = new Map(ACTS.map((act) => [act.id, act]));
