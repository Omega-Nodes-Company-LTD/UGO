/**
 * «Cos'hai fatto ieri?» (ADR-079) — puro, e apposta non una domanda al modello.
 *
 * Il diario ce l'ha lui, scritto la notte scorsa: chiedere a un provider di
 * raccontare una giornata che è già scritta in casa sarebbe pagare un token
 * per farsi ripetere una cosa che sappiamo. Stesso binario di
 * ADR-028/063/065/076/078: forma fissa, zero token, e **fallisce chiuso** —
 * «ieri sono stato al mare» non è una domanda sul suo diario.
 */

export interface DiaryAsk {
  /** quanti giorni indietro: 0 = stanotte (cioè la giornata di ieri, distillata) */
  daysAgo: number;
  /** ha chiesto il racconto lungo («leggimi il diario») invece della giornata */
  book: boolean;
}

/** I verbi che chiedono a LUI di raccontare. Senza uno di questi non è una domanda. */
const ASKS =
  /\b(cos['’]?\s*hai fatto|che hai fatto|come è andata|com['’]?è andata|come e' andata|raccontami|leggimi|mi racconti|che cosa hai fatto|ti ricordi cosa)\b/u;

/** Le parole che dicono che si parla del suo diario, non della mia giornata. */
const HIS = /\b(diario|la tua giornata|le tue giornate|tuo diario)\b/u;

const WHEN: readonly { pattern: RegExp; daysAgo: number }[] = [
  { pattern: /\bl['’]?altro ieri\b/u, daysAgo: 2 },
  { pattern: /\bieri\b/u, daysAgo: 1 },
  { pattern: /\boggi\b/u, daysAgo: 0 },
  { pattern: /\bstanotte\b/u, daysAgo: 0 },
];

export function parseDiaryAsk(text: string): DiaryAsk | undefined {
  const lower = text.toLowerCase().trim();
  if (!ASKS.test(lower)) return undefined;

  const book = HIS.test(lower);
  const when = WHEN.find((entry) => entry.pattern.test(lower));

  /**
   * Due strade, e nessuna delle due indovina. O nomini il giorno («cos'hai
   * fatto ieri?»), o nomini il diario («leggimi il diario»). «Come è andata?»
   * da sola non è una domanda sulla sua giornata: è come stai, e a quella
   * risponde lui parlando.
   */
  if (when === undefined) return book ? { daysAgo: 1, book: true } : undefined;
  // «cos'hai fatto ieri» senza nominare il diario è comunque una domanda sul
  // suo, perché il giorno è nominato e la giornata è la sua
  return { daysAgo: when.daysAgo, book };
}

/** La data che quella domanda indica, nel fuso della casa. */
export function dateFor(today: string, daysAgo: number): string {
  const [year, month, day] = today.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return today;
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() - daysAgo);
  return at.toISOString().slice(0, 10);
}

/**
 * Come lo racconta. Il testo è **suo**, scritto dal sogno: qui intorno ci
 * vanno solo le parole che lo introducono, mai una riscrittura — riassumere un
 * riassunto vorrebbe dire chiamare il provider, che è precisamente ciò che
 * questo gesto evita.
 */
export function tellDiary(pages: { date: string; text: string }[], ask: DiaryAsk): string {
  if (pages.length === 0) {
    return ask.book
      ? "Il mio diario è ancora vuoto: le pagine le scrivo di notte, dammi qualche giorno."
      : "Quella notte non ho scritto niente sul diario.";
  }
  if (!ask.book) {
    const [only] = pages;
    return only === undefined ? "" : only.text;
  }
  return pages.map((page) => `${page.date}: ${page.text}`).join("\n\n");
}
