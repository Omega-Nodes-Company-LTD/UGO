/**
 * L'orologio detto a voce, in italiano — PURO.
 *
 * «alle 7», «alle 7:30», «alle sette e mezza», «alle otto meno un quarto».
 * Stava dentro il parser del timer (ADR-078), dove è nato, e da lì non poteva
 * servire a nient'altro: il check-in (ADR-085) legge l'ora esattamente allo
 * stesso modo, e riscriverla una seconda volta vorrebbe dire due orologi che
 * prima o poi non segnano la stessa ora.
 *
 * «alle sette» adesso si legge: il numero a lettere è come si dice l'ora
 * parlando, e prima cadeva — la frase finiva dal provider, che rispondeva con
 * simpatia e non metteva nessuna sveglia.
 */

export const WORD_NUMBERS: Readonly<Record<string, number>> = {
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
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
  venti: 20,
  ventuno: 21,
  ventidue: 22,
  ventitré: 23,
  trenta: 30,
  quaranta: 40,
  quarantacinque: 45,
  cinquanta: 50,
  sessanta: 60,
  novanta: 90,
};

export const numberFrom = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const digits = Number(raw);
  if (Number.isFinite(digits) && raw.trim() !== "") return digits;
  return WORD_NUMBERS[raw.toLowerCase()];
};

export interface ClockReading {
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** dove comincia l'ora nella frase: quello che c'è prima è ancora frase */
  index: number;
  /** dove finisce, «e mezza» compreso */
  end: number;
}

/** «7:05», che è come lo direbbe una persona guardando l'ora. */
export function hourLabel(hour: number, minute: number): string {
  return `${String(hour)}:${minute < 10 ? "0" : ""}${String(minute)}`;
}

const AT = /\b(?:all[ae]|a\s+le|per\s+le)\s+([\p{L}]+|\d{1,2})(?:\s*[:.]\s*(\d{2}))?/u;

/**
 * L'ora scritta nella frase, se c'è. `undefined` quando non c'è o non è
 * un'ora: **fallisce chiuso**, perché un'ora indovinata è peggio di nessuna.
 */
export function readClock(lower: string): ClockReading | undefined {
  const match = AT.exec(lower);
  if (match === null) return undefined;

  let hour = numberFrom(match[1]);
  if (hour === undefined || !Number.isInteger(hour) || hour < 0 || hour > 23) return undefined;

  let minute = match[2] === undefined ? 0 : Number(match[2]);
  /**
   * «alle 7 e mezza» è come si dice l'ora in italiano, e leggerla come le 7:00
   * sarebbe mezz'ora di errore — cioè, su una sveglia, peggio di niente. Il
   * resto della frase dopo l'ora si legge, non si ignora.
   */
  const after = lower.slice(match.index + match[0].length);
  const quarter = /^\s*(e\s+mezz[ao]|e\s+un\s+quarto|meno\s+un\s+quarto)\b/u.exec(after);
  if (quarter !== null) {
    const said = quarter[1] ?? "";
    if (said.startsWith("e mezz")) minute += 30;
    else if (said.startsWith("e un")) minute += 15;
    else minute -= 15;
  }
  if (minute > 59) return undefined;

  /**
   * «alle nove» dette di sera sono le 21, e questo in italiano non è un
   * dettaglio di cortesia: è l'ora. La parte del giorno vale ovunque stia
   * nella frase — «ogni sera alle nove» e «alle nove di sera» sono la stessa
   * cosa detta in due ordini.
   *
   * `notte` sta fuori apposta: «alle due di notte» sono le 2 e «alle undici di
   * notte» sono le 23, quindi la parola da sola non decide niente — e una
   * regola che indovina metà delle volte, su una sveglia, è peggio di nessuna
   * regola.
   */
  if (hour < 12 && /(?<![\p{L}])(sera|serata|stasera|pomeriggio)(?![\p{L}])/u.test(lower)) {
    hour += 12;
  }

  // «alle otto meno un quarto» sono le 7:45, e a mezzanotte meno un quarto
  // sono le 23:45 del giorno prima: l'ora gira, non va sottozero
  const carried = hour + (minute < 0 ? -1 : 0);
  return {
    hour: (carried + 24) % 24,
    minute: (minute + 60) % 60,
    index: match.index,
    end: match.index + match[0].length + (quarter?.[0].length ?? 0),
  };
}
