import { hourLabel, readClock } from "./clock.js";

/**
 * Il check-in (ADR-085) — puro, e apposta non una chiamata al modello.
 *
 * È la cosa che i compagni artificiali fanno e noi no: **farsi vivi**, a
 * un'ora, tutti i giorni. Replika chiede com'è andata la giornata, ElliQ
 * chiede se hai bevuto e se hai preso le medicine — e non è una funzione, è
 * la ragione per cui la gente si affeziona: qualcuno che si ricorda di
 * chiedere.
 *
 * La distinzione che tiene in piedi tutto questo non è grammaticale:
 *
 * - un **promemoria** (ADR-028) è tuo e succede una volta: il contenuto è
 *   tuo, l'ora è tua, lui lo custodisce;
 * - un **timer** (ADR-078) è un ordine con sopra un'ora, e suona anche a
 *   iniziativa spenta;
 * - un **check-in** è **suo** e torna: da domani vorrà sapere lui, e a
 *   iniziativa spenta **tace**, perché farsi vivi è esattamente ciò che
 *   l'interruttore spegne.
 *
 * Stesso binario di ADR-028/063/065/076/078/079/080: forma fissa, lingua
 * fissa, zero token, testabile per esempi, e **fallisce chiuso** — un
 * appuntamento quotidiano che nessuno ha chiesto è la molestia perfetta.
 */

export type CheckinCommand =
  | {
      action: "set";
      /** 0..23 nel fuso della casa */
      hour: number;
      /** 0..59 */
      minute: number;
      /** 0 = domenica … 6 = sabato; `undefined` = tutti i giorni */
      weekday: number | undefined;
      /** quello che chiederà, con le parole di chi gliel'ha chiesto */
      question: string;
    }
  | { action: "cancel" }
  | { action: "list" };

/** Come li dice una persona, e come li conta `Date#getDay`. */
const WEEKDAYS: Readonly<Record<string, number>> = {
  domenica: 0,
  lunedì: 1,
  lunedi: 1,
  martedì: 2,
  martedi: 2,
  mercoledì: 3,
  mercoledi: 3,
  giovedì: 4,
  giovedi: 4,
  venerdì: 5,
  venerdi: 5,
  sabato: 6,
};

export const WEEKDAY_NAMES = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
] as const;

/**
 * Le parole di ADR-028 e ADR-078. Se ci sono, questo parser **si tira
 * indietro**: «ricordami ogni giorno di innaffiare» ha una cosa da ricordare,
 * e chi ce l'ha la gestisce meglio di chi ha solo la cadenza.
 */
const NOT_MINE = /(ricordami|ricordamelo|rammentami|avvisami|avvertimi|svegli(a|ami|armi)|timer)/u;

/** La coda che una persona aggiunge e che non fa parte della domanda. */
const TAIL = /\s*[,;]\s*(mi raccomando|per favore|grazie|ok|va bene)\b.*$/iu;

const MAX_QUESTION = 120;

/** «ogni», «tutti i giorni», «ogni sera»: la cadenza detta a voce. */
const EVERY = /(?<![\p{L}])(ogni|tutt[ei]\s+(?:i|le)\s+(?:giorni|sere|mattine|settimane))(?![\p{L}])/u;

export function parseCheckin(text: string): CheckinCommand | undefined {
  const lower = text.toLowerCase().trim();

  // ── spegnere ─────────────────────────────────────────────────────────
  // Prima di tutto: «non chiedermelo più» contiene «chiedermelo», e leggerla
  // come un appuntamento nuovo sarebbe il contrario di quello che è stato
  // detto — l'errore peggiore che questo parser possa fare.
  if (
    /(non\s+chieder(mel|m)o?\s*(lo|me)?\s*più|smettila\s+di\s+chieder|basta\s+(con\s+le\s+)?domande)/u.test(
      lower,
    )
  ) {
    return { action: "cancel" };
  }

  // ── chiedere quali sono ──────────────────────────────────────────────
  if (
    /(cosa|che cosa|quali|che)\s+(domande\s+)?(mi\s+)?(chiedi|fai|domandi)/u.test(lower) &&
    /\?|\bogni\b|\bdomande\b/u.test(lower)
  ) {
    return { action: "list" };
  }

  if (NOT_MINE.test(lower)) return undefined;
  // senza cadenza è una domanda sola, e una domanda sola non è un appuntamento
  if (!EVERY.test(lower)) return undefined;

  // qualunque forma del verbo: «chiedimi», «chiedermi», «chiedi». Scritta a
  // mano un pezzo per volta, mancava proprio quella che dice una persona
  const asks = /(?<![\p{L}])chied\p{L}*(?![\p{L}])/u.exec(lower);
  if (asks === null) return undefined;

  const clock = readClock(lower);
  // «ogni mattina chiedimi come sto» non si indovina: «mattina» sono cinque
  // ore, e farsi vivi nell'ora sbagliata è farsi vivi male
  if (clock === undefined) return undefined;

  const weekday = weekdayIn(lower);

  const question = lower
    .slice(asks.index + asks[0].length)
    .replace(TAIL, "")
    .replace(/[?!.]+$/u, "")
    .trim();
  if (question.length === 0 || question.length > MAX_QUESTION) return undefined;

  return { action: "set", hour: clock.hour, minute: clock.minute, weekday, question };
}

function weekdayIn(lower: string): number | undefined {
  for (const [name, day] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(lower)) return day;
  }
  return undefined;
}

/** Quando torna, detto come lo direbbe una persona. */
export function cadenceOf(weekday: number | null | undefined): string {
  if (weekday === null || weekday === undefined) return "ogni giorno";
  return `ogni ${WEEKDAY_NAMES[weekday] ?? "giorno"}`;
}

/**
 * La conferma ripete l'appuntamento **per intero**: l'ora, la cadenza e la
 * domanda. Non è cortesia — è l'unico momento in cui chi ha parlato può
 * accorgersi che è stato capito un altro orario, e smentirlo subito.
 */
export function confirmCheckin(command: Extract<CheckinCommand, { action: "set" }>): string {
  return `Va bene: ${cadenceOf(command.weekday)} alle ${hourLabel(command.hour, command.minute)} ti chiedo «${command.question}».`;
}

export interface StandingCheckin {
  question: string;
  hour: number;
  minute: number;
  weekday: number | null;
}

export function tellCheckins(rows: readonly StandingCheckin[]): string {
  if (rows.length === 0) return "Non ti chiedo niente di preciso, per ora.";
  const lines = rows.map(
    (row) => `${cadenceOf(row.weekday)} alle ${hourLabel(row.hour, row.minute)}: «${row.question}»`,
  );
  return `Ti chiedo queste cose. ${lines.join("; ")}.`;
}

/** Le parole con cui si fa vivo. La domanda è già sua: non la riscrive. */
export function voiceCheckin(question: string): string {
  return `Ehi... ${question}?`;
}
