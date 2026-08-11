/**
 * Reminders — PURE, and deliberately not an LLM call.
 *
 * «ricordami di buttare l'acqua alle 13» is a fixed shape in a fixed language.
 * Parsing it locally costs nothing, answers instantly, and is testable by
 * example; handing it to a model would cost a token, take a second, and fail
 * in ways nobody could reproduce.
 *
 * It fails CLOSED. A reminder that lands at the wrong time is worse than one
 * that was never taken, so anything ambiguous returns undefined and the
 * sentence carries on to the normal conversation.
 *
 * Where it is stored is the good part: a reminder IS a desire with an hour on
 * it. `desires` already held intentions that must survive the night, and
 * initiative (ADR-027) already voices the ones whose moment has come.
 */

export interface Reminder {
  /** what to be reminded of, cleaned of the time words */
  task: string;
  /** minutes from now, always > 0 */
  inMinutes: number;
}

/** The verbs that mean "put this on your list", not "tell me now". */
const TRIGGERS = [
  "ricordami",
  "ricordamelo",
  "ricordati",
  "rammentami",
  "avvisami",
  "avvertimi",
  "svegliami",
  "dimmi di",
  "dimmi tra",
  "dimmi fra",
];

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  quindici: 15,
  venti: 20,
  trenta: 30,
  quaranta: 40,
  quarantacinque: 45,
  cinquanta: 50,
};

const DAY_MINUTES = 24 * 60;
/** Beyond this it is a calendar entry, not something a pig should hold. */
const MAX_MINUTES = 7 * DAY_MINUTES;

const numberFrom = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const digits = Number(raw);
  if (Number.isFinite(digits)) return digits;
  return WORD_NUMBERS[raw.toLowerCase()];
};

/** Removes the matched time phrase and the trigger verb from the task text. */
function cleanTask(text: string, ...cuts: string[]): string {
  let out = text;
  for (const cut of cuts) {
    if (cut !== "") out = out.replace(cut, " ");
  }
  return out
    .replace(new RegExp(`\\b(${TRIGGERS.join("|")})\\b`, "giu"), " ")
    .replace(/\b(di|che|devo|dovevo|poi|per favore|per piacere)\b/giu, " ")
    .replace(/[,;.!?]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * @param nowHour   0..23 in the household's timezone
 * @param nowMinute 0..59
 */
export function parseReminder(
  text: string,
  nowHour: number,
  nowMinute: number,
): Reminder | undefined {
  const lower = text.toLowerCase();
  if (!TRIGGERS.some((trigger) => lower.includes(trigger))) return undefined;

  // ── «fra mezz'ora» ────────────────────────────────────────────────────
  const half = /\b(?:fra|tra)\s+mezz'?\s*ora\b/u.exec(lower);
  if (half !== null) {
    const task = cleanTask(text, half[0]);
    return task === "" ? undefined : { task, inMinutes: 30 };
  }

  // ── «fra 10 minuti» · «tra due ore» ───────────────────────────────────
  // the apostrophe is not optional decoration in Italian: «un'ora» elides,
  // and without allowing it here the commonest phrasing of all fell through
  const relative =
    /\b(?:fra|tra)\s+([\p{L}\d]+)\s*['’]?\s*(minut[oi]|min|or[ae]|giorn[oi])\b/u.exec(lower);
  if (relative !== null) {
    const amount = numberFrom(relative[1]);
    const unit = relative[2] ?? "";
    if (amount !== undefined && amount > 0) {
      const factor = unit.startsWith("giorn") ? DAY_MINUTES : unit.startsWith("or") ? 60 : 1;
      const inMinutes = amount * factor;
      const task = cleanTask(text, relative[0]);
      if (task !== "" && inMinutes <= MAX_MINUTES) return { task, inMinutes };
    }
    return undefined;
  }

  // ── «alle 13» · «alle 13:30» · «domani alle 9» ────────────────────────
  const absolute = /\b(?:all[ae]|per\s+le)\s+(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\b/u.exec(lower);
  if (absolute !== null) {
    const hour = numberFrom(absolute[1]);
    const minute = absolute[2] === undefined ? 0 : Number(absolute[2]);
    if (hour === undefined || hour > 23 || minute > 59) return undefined;
    const tomorrow = /\bdomani\b/u.test(lower);
    let delta = (hour - nowHour) * 60 + (minute - nowMinute);
    // an hour already gone means tomorrow, which is what a person means
    if (delta <= 0 || tomorrow) delta += DAY_MINUTES;
    if (tomorrow && delta > DAY_MINUTES * 2) delta -= DAY_MINUTES;
    const task = cleanTask(text, absolute[0], "domani");
    if (task !== "" && delta > 0 && delta <= MAX_MINUTES) return { task, inMinutes: delta };
    return undefined;
  }

  return undefined;
}

/** What UGO says back. Zero tokens: the words are ours, not the model's. */
export function confirmReminder(reminder: Reminder): string {
  if (reminder.inMinutes < 60) {
    return `Va bene: fra ${String(reminder.inMinutes)} minuti ti ricordo ${reminder.task}.`;
  }
  if (reminder.inMinutes < DAY_MINUTES) {
    const hours = Math.round(reminder.inMinutes / 60);
    return `Va bene: fra ${String(hours)} ${hours === 1 ? "ora" : "ore"} ti ricordo ${reminder.task}.`;
  }
  return `Va bene, me lo segno: ti ricordo ${reminder.task}.`;
}

/** What he says when the moment arrives. */
export function voiceReminder(task: string): string {
  return `Ehi, mi avevi detto di ricordarti ${task}.`;
}
