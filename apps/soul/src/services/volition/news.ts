/**
 * La rassegna (ADR-080) — «che notizie ci sono?», risposto in casa.
 *
 * I feed li legge il sogno da PROGETTO gruppo 10: ogni giro scarica gli
 * articoli, li deduplica e li tiene su `feed_items`. Poi, ogni tanto, uno di
 * quelli diventa un consiglio — **quando decide lui**. Quello che mancava era
 * la domanda: *adesso, cosa è arrivato?*
 *
 * Stesso binario di ADR-028/063/065/076/078/079: forma fissa, **zero token**,
 * e fallisce chiuso. I titoli sono già testo scritto da qualcun altro: farli
 * riscrivere a un modello costerebbe e li peggiorerebbe.
 */

export interface NewsAsk {
  /** quanti titoli leggere: pochi, perché è una rassegna e non un feed reader */
  limit: number;
}

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 8;

/**
 * Le parole che dicono «i miei feed», e non «una notizia» in generale.
 *
 * Confini scritti a mano e non con `\b`: in JavaScript `\b` guarda
 * `[A-Za-z0-9_]`, quindi dopo una vocale accentata **non c'è nessun confine** e
 * `novità\b` non combacia mai. Con l'italiano è una trappola che non fa
 * rumore — la parola semplicemente non viene riconosciuta — e infatti l'ha
 * trovata il test, non la lettura.
 */
const EDGE_LEFT = "(?<![\\p{L}])";
const EDGE_RIGHT = "(?![\\p{L}])";
const SUBJECT = new RegExp(
  `${EDGE_LEFT}(?:notizie|notizia|rassegna|titoli|titolo|feed|novità)${EDGE_RIGHT}`,
  "u",
);

/**
 * I modi in cui la si chiede. Serve una **domanda** o un **ordine**: senza,
 * «ho letto una notizia interessante» diventerebbe una rassegna.
 */
const ASKS =
  /\b(che|quali|cosa|c'è|ci sono|ce n'è|leggimi|dimmi|raccontami|dammi|fammi|sentiamo|ci sono novità)\b/u;

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
};

export function parseNewsAsk(text: string): NewsAsk | undefined {
  const lower = text.toLowerCase().trim();
  if (!SUBJECT.test(lower) || !ASKS.test(lower)) return undefined;

  // «leggimi cinque notizie», «dammi 5 titoli»
  const counted = new RegExp(
    `${EDGE_LEFT}([\\p{L}\\d]+)\\s+(?:notizie|notizia|titoli|titolo|novità)${EDGE_RIGHT}`,
    "u",
  ).exec(lower);
  const asked = counted === null ? undefined : counted[1];
  const wanted =
    asked === undefined
      ? undefined
      : Number.isFinite(Number(asked))
        ? Number(asked)
        : WORD_NUMBERS[asked];

  const limit =
    wanted === undefined || wanted <= 0 ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.round(wanted));
  return { limit };
}

export interface NewsItem {
  title: string;
  feed: string;
}

/**
 * Come la legge. I titoli **non si riscrivono**: sono già le parole di chi li
 * ha scritti, e passarli a un modello costerebbe un token per peggiorarli.
 */
export function tellNews(items: NewsItem[], subscribed: number): string {
  if (subscribed === 0) {
    return "Non sei iscritto a nessun feed: li aggiungi dal pannello, in «I feed».";
  }
  if (items.length === 0) {
    return "Dai tuoi feed non è arrivato niente di nuovo.";
  }
  const lines = items.map((item) => `Da ${item.feed}: ${item.title}.`);
  const head =
    items.length === 1 ? "Una cosa sola, dai tuoi feed." : `${String(items.length)} cose, dai tuoi feed.`;
  return [head, ...lines].join(" ");
}
