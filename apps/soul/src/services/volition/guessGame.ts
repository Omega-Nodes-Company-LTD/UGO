/**
 * «Ho pensato un numero» (ADR-112), la parte pura.
 *
 * Tutto quello che decide il gioco sta qui e **non passa da un modello**: a
 * rispondere «più alto» o «più basso» è un confronto fra due interi, e
 * chiederlo a un provider costerebbe un token per fare peggio. È la stessa
 * famiglia deterministica di «ricordami», «cerca:», «leggimi il diario».
 *
 * E c'è una ragione in più, che vale per questo gioco soltanto: il segreto non
 * deve entrare in un prompt. Un modello a cui si consegna il numero e si chiede
 * di non dirlo è un modello a cui si è già chiesto troppo.
 */

/** Il campo da gioco: piccolo abbastanza da finire, grande abbastanza da non essere ovvio. */
export const LOW = 1;
export const HIGH = 100;

/**
 * Dopo quanti tentativi si offre la resa. Sette bastano per dicotomia — con
 * cento numeri ne servono al massimo sette — quindi chi è arrivato a dodici
 * non sta cercando, si è perso.
 */
export const MERCY_TURNS = 12;

/** Quanto vive una partita abbandonata: un gioco lasciato a metà non è per sempre. */
export const GAME_STALE_HOURS = 12;

export type GameMove =
  | { move: "start" }
  | { move: "guess"; number: number }
  | { move: "give-up" }
  | { move: "none" };

const START =
  /\b(giochiamo|facciamo un gioco|indovina il numero|pensa un numero|un gioco)\b/u;
const GIVE_UP = /\b(mi arrendo|rinuncio|non lo so|dimmelo|basta,? mi arrendo)\b/u;

/**
 * Legge la mossa.
 *
 * `playing` cambia il senso della frase, e va detto: **fuori partita un numero
 * non è un tentativo**. «Ho 43 anni» durante una partita è un tentativo — ed è
 * un rischio accettato, perché una partita è aperta solo se qualcuno l'ha
 * chiesta e dura poche battute — ma fuori sarebbe un gioco che comincia da
 * solo, che è molto peggio.
 */
export function moveOf(text: string, playing: boolean): GameMove {
  const lower = text.toLowerCase().trim();
  if (playing && GIVE_UP.test(lower)) return { move: "give-up" };
  if (playing) {
    const found = /(?:^|\D)(\d{1,3})(?:\D|$)/u.exec(lower);
    const guess = found?.[1] === undefined ? Number.NaN : Number.parseInt(found[1], 10);
    if (Number.isInteger(guess) && guess >= LOW && guess <= HIGH) {
      return { move: "guess", number: guess };
    }
  }
  if (START.test(lower)) return { move: "start" };
  return { move: "none" };
}

export interface Verdict {
  /** cosa dire */
  reply: string;
  /** la partita è finita con questa mossa? */
  over: boolean;
}

export function judge(secret: number, guess: number, turns: number): Verdict {
  if (guess === secret) {
    return {
      reply: `Preso! Era ${String(secret)}, e ci sei arrivato in ${String(turns)} ${
        turns === 1 ? "colpo" : "tentativi"
      }. Grunf!`,
      over: true,
    };
  }
  const direction = guess < secret ? "più alto" : "più basso";
  const mercy =
    turns >= MERCY_TURNS ? " Se vuoi ti dico dov'è: basta che dici «mi arrendo»." : "";
  return { reply: `No, ${direction}.${mercy} Grunf.`, over: false };
}

export function tellStart(): string {
  return `Ho pensato un numero fra ${String(LOW)} e ${String(HIGH)}. Indovina!`;
}

export function tellAlreadyPlaying(): string {
  return "Il numero l'ho già pensato, sto ancora aspettando che tu lo indovini. Grunf.";
}

export function tellGaveUp(secret: number, turns: number): string {
  return `Era ${String(secret)}. Ci hai provato ${String(turns)} volte — la prossima ti va meglio, grunf.`;
}
