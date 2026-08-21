import { summaryPrompt } from "@ugo/prompts";

/**
 * «Com'è andata la settimana?» (backlog gruppo 2, template `famiglia`).
 *
 * Il diario delle ultime sette notti c'è già: chiedere il racconto di una
 * giornata sola è ADR-079 e non costa niente, perché il testo è già scritto.
 * Una settimana no — sette pagine messe in fila non sono un riassunto, sono
 * sette pagine — e questo è il primo caso in cui vale la pena far lavorare un
 * modello su quello che è in casa.
 *
 * A lavorarci è **il modello di casa** (ADR-094/095): il materiale è la vita
 * privata della famiglia, sta già sul server, e farla uscire per farsela
 * riassumere sarebbe il contrario di ciò che promette il confidente
 * inviolabile. Se il modello di casa non c'è, si risponde che non c'è —
 * mai chiedendo altrove.
 */

/** Chiede un racconto, e lo chiede della settimana: servono tutt'e due. */
const ASKS =
  /\b(riassum\w*|com['’]?\s*è andata|com['’]?e andata|come è andata|come e' andata|raccontami|com['’]?è stata|come è stata)\b/u;
const WEEK = /\b(settimana|ultimi sette giorni|questi giorni|ultimi giorni)\b/u;

export function parseWeekAsk(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return ASKS.test(lower) && WEEK.test(lower);
}

export interface DiaryPage {
  date: string;
  text: string;
}

/** Quanto di ogni pagina si porta al modello: un diario può essere lungo. */
const PAGE_CHARS = 400;

/**
 * Il prompt: il template versionato, poi le pagine con la loro data.
 *
 * Le date entrano perché «martedì è saltata la consegna» e «una volta è
 * saltata la consegna» non sono la stessa frase, e senza data un modello
 * piccolo appiattisce la settimana in un unico giorno indistinto.
 */
export function weekPrompt(pages: readonly DiaryPage[]): string {
  const body = pages
    .map((page) => `${page.date}: ${page.text.slice(0, PAGE_CHARS)}`)
    .join("\n");
  return `${summaryPrompt("famiglia")}\n\n${body}`;
}

/** Non c'è diario per quei giorni: si dice, non si inventa una settimana. */
export function tellNoWeek(): string {
  return "Di questa settimana non ho ancora scritto niente nel diario, quindi non saprei riassumerla.";
}

/** Il modello di casa non risponde: si dice anche questo, invece di tacere. */
export function tellWeekUnavailable(): string {
  return "La settimana ce l'ho in testa ma adesso non riesco a metterla in fila. Riprova più tardi.";
}
