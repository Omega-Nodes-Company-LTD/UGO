/**
 * «Cosa ti ricordi di marzo?» (ADR-086) — puro, e apposta non una domanda al
 * modello.
 *
 * I ricordi ce li ha lui, scritti dal sogno notte dopo notte. Farli
 * raccontare a un provider vorrebbe dire pagare un token per farsi ripetere
 * una cosa che è già in casa, e per giunta riscritta con parole non sue.
 *
 * Stesso binario di ADR-028/063/065/076/078/079/080/085, e **fallisce
 * chiuso** su due fronti che sembrano uno solo: «mi ricordo che a marzo
 * pioveva» non è una domanda — è una cosa che ti stanno raccontando, e
 * rispondere con un elenco sarebbe interrompere chi parla.
 */

export interface MemoryAsk {
  /** 1..12, oppure `undefined` se ha chiesto un anno intero */
  month: number | undefined;
  /** l'anno detto per esteso, `-1` per «l'anno scorso», `undefined` se taciuto */
  year: number | undefined;
}

const MONTHS: readonly string[] = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * Deve chiedere a LUI di ricordare. «ti ricordi» e «che ricordi hai» sono
 * domande; «mi ricordo» è un racconto, e non è di questo parser.
 */
const ASKS =
  /(?<![\p{L}])(cosa\s+(ti\s+)?ricord\p{L}*|che\s+ricord\p{L}*\s+hai|che\s+cosa\s+(ti\s+)?ricord\p{L}*|ti\s+ricordi\s+(di|del|della|dell))(?![\p{L}])/u;

/** «ricordami di comprare il latte» è un promemoria (ADR-028), non una domanda. */
const NOT_MINE = /(?<![\p{L}])(ricordami|ricordamelo|rammentami)(?![\p{L}])/u;

/** «cos'hai fatto ieri» è il diario (ADR-079): una giornata, non un mese. */
const DIARY = /(?<![\p{L}])(diario|ieri|oggi|stanotte)(?![\p{L}])/u;

export function parseMemoryAsk(text: string): MemoryAsk | undefined {
  const lower = text.toLowerCase().trim();
  if (NOT_MINE.test(lower) || DIARY.test(lower)) return undefined;
  if (!ASKS.test(lower)) return undefined;

  const monthIndex = MONTHS.findIndex((name) =>
    new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(lower),
  );
  const said = /(?<![\d])(20\d{2})(?![\d])/u.exec(lower);
  const year = said === null ? undefined : Number(said[1]);

  if (monthIndex !== -1) {
    return { month: monthIndex + 1, ...(year !== undefined && { year }) } as MemoryAsk;
  }
  // «dell'anno scorso»: l'apostrofo attacca la parola alla precedente, quindi
  // il confine si mette prima di «anno» e non prima della «l» — davanti a
  // quella c'è un'altra lettera, e il confine non ci sarebbe mai
  if (/(?<![\p{L}])anno\s+scorso(?![\p{L}])/u.test(lower)) {
    return { month: undefined, year: -1 };
  }
  if (year !== undefined) return { month: undefined, year };

  /**
   * Senza un tempo non si risponde. «Cosa ti ricordi?» sono *tutti* i suoi
   * ricordi, e un elenco di tutto non è un ricordo: è un dump.
   */
  return undefined;
}

/**
 * Il periodo che quella domanda indica: `YYYY-MM` per un mese, `YYYY` per un
 * anno intero.
 *
 * La regola sull'anno taciuto è quella che userebbe una persona: **un mese non
 * ancora arrivato è quello dell'anno scorso**. Ad agosto «dicembre» è il
 * dicembre che c'è stato, non quello che verrà — e rispondere «non mi viene in
 * mente niente» per un mese futuro sarebbe vero e inutile.
 */
export function monthOf(ask: MemoryAsk, today: string): string {
  const [nowYear, nowMonth] = today.split("-").map(Number);
  const thisYear = nowYear ?? new Date().getUTCFullYear();
  const thisMonth = nowMonth ?? 1;

  if (ask.month === undefined) {
    const year = ask.year === -1 ? thisYear - 1 : (ask.year ?? thisYear);
    return String(year);
  }
  const year =
    ask.year === undefined || ask.year === -1
      ? ask.month > thisMonth
        ? thisYear - 1
        : thisYear
      : ask.year;
  return `${String(year)}-${ask.month < 10 ? "0" : ""}${String(ask.month)}`;
}

/** «marzo 2026», «2025»: come lo direbbe una persona. */
export function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  if (month === undefined) return year ?? period;
  const name = MONTHS[Number(month) - 1];
  return name === undefined ? period : `${name} ${year ?? ""}`.trim();
}

export interface RememberedLine {
  text: string;
  kind: string;
}

/**
 * Come li racconta. I ricordi sono **suoi, parola per parola**: qui intorno ci
 * vanno solo le parole che li introducono. Riassumerli vorrebbe dire chiamare
 * il provider, che è precisamente ciò che questo gesto evita.
 */
export function tellMemories(lines: readonly RememberedLine[], period: string): string {
  const when = periodLabel(period);
  if (lines.length === 0) {
    return `Di ${when} non mi viene in mente niente.`;
  }
  const body = lines.map((line) => `— ${line.text}`).join("\n");
  return `Di ${when} mi ricordo questo.\n${body}`;
}
