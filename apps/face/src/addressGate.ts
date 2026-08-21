/**
 * Il cancello del nome (ADR-111): UGO sente tutto, risponde solo a chi si
 * rivolge a lui.
 *
 * Con le orecchie sempre accese ogni frase della stanza diventava una
 * conversazione: due persone che parlano fra loro, la televisione, una
 * telefonata — lui rispondeva a tutto, perché non c'era niente che gli
 * dicesse «non è con te». La parola di sveglia scelta non è una formula
 * («ehi UGO»): è il suo NOME, che è come ci si chiama fra persone — «ciao
 * Silvio», «Silvio, che ne pensi?».
 *
 * Tre regole, tutte qui e tutte pure:
 *
 * 1. **Il nome apre.** Una frase che contiene il nome di un abitante della
 *    stanza è rivolta a lui — il nome vale ovunque nella frase, perché il
 *    vocativo italiano sta dove gli pare. La dettatura storpia («Silvia» per
 *    «Silvio»), quindi sui nomi lunghi si accetta UNA lettera di differenza.
 * 2. **La conversazione resta aperta.** Chiamarlo a ogni frase sarebbe il
 *    walkie-talkie di nuovo: dopo un nome (o una sua risposta) c'è una
 *    finestra in cui le frasi passano senza nome.
 * 3. **La finestra non è un assegno in bianco.** Se dopo averlo chiamato ti
 *    metti a parlare con un altro, ogni frase rinnoverebbe la finestra per
 *    sempre. Il contatore chiude: dopo un po' di giri senza mai sentire il
 *    suo nome, si rimette in ascolto e aspetta di essere chiamato — come un
 *    animale che capisce che il discorso non è più con lui.
 *
 * Niente qui decide COSA rispondere: solo se la frase parte verso soul.
 * Quello che non parte resta in casa — non va nel registro, non va in
 * biografia, non costa un token.
 */

import { normalize } from "./heard.js";

/** Quanto resta aperta la conversazione dall'ultimo scambio (nome o sua voce). */
export const ATTENTION_MS = 60_000;
/**
 * Quante frasi di seguito risponde senza mai sentire il suo nome. Non è un
 * numero magico: è il punto in cui «stiamo ancora parlando» diventa «sta
 * origliando una conversazione altrui». Il nome lo azzera; le sue risposte no
 * — se lo azzerassero anche loro, il tetto non chiuderebbe mai.
 */
export const MAX_UNNAMED_TURNS = 6;
/** Da questa lunghezza in su il nome tollera una lettera storpiata. */
const FUZZY_MIN_LENGTH = 5;
/** Pezzi di nome più corti («de», «lo») non si cercano da soli. */
const NAME_PART_MIN = 3;

export type AddressVerdict = "addressed" | "conversing" | "overheard";

/** Le due stringhe distano al massimo una lettera (sostituita, aggiunta o tolta)? */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0;
  let j = 0;
  let edited = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (edited) return false;
    edited = true;
    // stessa lunghezza: una sostituzione; diversa: una lettera in più nel lungo
    if (short.length === long.length) i += 1;
    j += 1;
  }
  return true;
}

/** I pezzi di un nome che vale la pena cercare in una frase. */
function nameParts(name: string): string[] {
  const whole = normalize(name);
  if (whole === "") return [];
  const parts = whole.split(" ").filter((part) => part.length >= NAME_PART_MIN);
  // un nome fatto solo di pezzi corti («Bo») si cerca intero, esatto
  return parts.length > 0 ? parts : [whole.replaceAll(" ", "")];
}

/** La frase nomina questa creatura? Puro, esportato per i test e per il muso. */
export function mentionsName(text: string, name: string): boolean {
  const heard = normalize(text).split(" ");
  return nameParts(name).some((part) =>
    heard.some((word) =>
      part.length >= FUZZY_MIN_LENGTH ? withinOneEdit(word, part) : word === part,
    ),
  );
}

export class AddressGate {
  private lastExchangeAt = -Infinity;
  private unnamedTurns = 0;

  /**
   * I nomi arrivano da una funzione, non dal costruttore: il roster della
   * stanza arriva dal socket quando arriva, e il cancello deve vedere sempre
   * quello corrente.
   */
  public constructor(private readonly names: () => readonly string[]) {}

  /**
   * Il verdetto su una frase sentita. Muta lo stato solo su «addressed»:
   * essere chiamati per nome azzera il contatore e rinnova la finestra anche
   * se poi la frase non parte (un «Silvio!» da solo è troppo corto per soul,
   * ma lui si è girato lo stesso).
   */
  public judge(text: string, nowMs: number): AddressVerdict {
    const known = this.names().filter((name) => normalize(name) !== "");
    // senza nomi non si può filtrare: si passa tutto, che è il mondo di prima
    // (roster non ancora arrivato, o soul vecchio che non lo manda)
    if (known.length === 0) return "conversing";
    if (known.some((name) => mentionsName(text, name))) {
      this.lastExchangeAt = nowMs;
      this.unnamedTurns = 0;
      return "addressed";
    }
    if (nowMs - this.lastExchangeAt <= ATTENTION_MS && this.unnamedTurns < MAX_UNNAMED_TURNS) {
      return "conversing";
    }
    return "overheard";
  }

  /**
   * Una frase SENZA nome è partita davvero verso soul: un giro di
   * conversazione. Rinnova la finestra e consuma il contatore — è il punto 3.
   * (Le frasi col nome non passano di qui: `judge` ha già azzerato tutto.)
   */
  public sent(nowMs: number): void {
    this.lastExchangeAt = nowMs;
    this.unnamedTurns += 1;
  }

  /** UGO ha parlato ad alta voce: la conversazione è viva, la finestra riparte. */
  public spoke(nowMs: number): void {
    this.lastExchangeAt = nowMs;
  }
}
