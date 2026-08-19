import type { LocalTextClient } from "./localText.js";
import type { RankedMemory } from "./rerank.js";

/**
 * «Non lo so» (ADR-107).
 *
 * Il recupero torna sempre qualcosa: `k` ricordi, ordinati, anche quando la
 * risposta non c'è da nessuna parte. Quei cinque ricordi finiscono nel prompt
 * sotto «Ricordi pertinenti», e a quel punto UGO è stato *invitato* a
 * rispondere con del materiale che non c'entra. Confabulare, lì, non è un
 * difetto del modello: è quello che gli abbiamo chiesto.
 *
 * ADR-106 ha misurato che la **forma** della distribuzione non sa distinguere
 * i due casi — `gap` e `plateau` sono rovesciati, `top1` si sovrappone di
 * quattro centesimi. Quindi si guarda il **significato**, e a guardarlo è il
 * modello di casa.
 */

/**
 * L'unico indizio che ha retto la misura, e si usa **solo in positivo**.
 *
 * Il primo risultato trovato da entrambi i bracci — vettoriale e lessicale —
 * non capita mai su una domanda senza risposta (zero falsi positivi su dieci
 * negativi, near-miss lessicali compresi). Due strade indipendenti che
 * convergono sullo stesso ricordo sono una prova che quel ricordo c'entra.
 *
 * Il contrario **non** vale: quattro domande su dieci che una risposta ce
 * l'hanno non fanno convergere i bracci. Per quelle non si conclude niente, si
 * chiede.
 *
 * È un fatto strutturale — due indici diversi hanno detto la stessa cosa — e
 * non una soglia tarata su un numero: è la ragione per cui si può fidarsene
 * più di un `top1 ≥ 0.65` che sui dieci negativi avrebbe un centesimo di
 * margine.
 */
export function armsAgree(ranked: readonly RankedMemory[]): boolean {
  const first = ranked[0];
  return first?.vectorRank !== undefined && first.lexicalRank !== undefined;
}

export interface AnswerableVerdict {
  /** se i ricordi ripescati contengono di che rispondere */
  answerable: boolean;
  /** se è stato chiesto al modello, o se è bastato l'accordo dei bracci */
  asked: boolean;
  /** la parola grezza del modello, per il banco e per i log: mai per l'utente */
  said?: string | undefined;
}

/**
 * La domanda al modello di casa, in italiano e a risposta chiusa.
 *
 * Volutamente **senza** chiedergli la risposta: gli si chiede solo se la
 * risposta è lì dentro. Un giudice che risponde nel merito diventa un secondo
 * generatore, con un secondo modo di sbagliare e il doppio dei token.
 */
export function judgePrompt(question: string, memories: readonly string[]): string {
  const list = memories.map((text, at) => `${String(at + 1)}. ${text}`).join("\n");
  return [
    "Ecco alcuni appunti e una domanda.",
    "",
    "Appunti:",
    list,
    "",
    `Domanda: ${question}`,
    "",
    "Gli appunti contengono la risposta a questa domanda?",
    "Rispondi con una sola parola: SI oppure NO.",
    "Rispondi NO se la risposta non c'è, anche se gli appunti parlano di cose vicine.",
  ].join("\n");
}

/**
 * Legge il verdetto senza fidarsi della forma.
 *
 * Un modello piccolo risponde «SI», «Sì.», «si, il gatto si chiama Bruno», o
 * un preambolo intero. Si guarda la prima parola utile; se non è nessuna delle
 * due, **si assume di sì** — vedi `canAnswer` per il perché.
 */
export function readVerdict(said: string | undefined): boolean {
  if (said === undefined) return true;
  const head = said
    .trim()
    .toLowerCase()
    .replace(/[^a-zàèéìòù\s]/gu, " ")
    .trim()
    .split(/\s+/u)[0];
  if (head === "no") return false;
  return true;
}

export interface CanAnswerDeps {
  local: LocalTextClient;
  /** quanti ricordi mostrare al giudice: gli stessi che finirebbero nel prompt */
  limit?: number;
}

/**
 * Il verdetto completo.
 *
 * **Gli errori non costano uguale, e il disegno lo rispecchia.** Astenersi da
 * una risposta che esiste è il danno peggiore: UGO dice «non lo so» di una
 * cosa che sa, e chi lo usa smette di chiedergliela. Rispondere a vuoto è
 * fastidioso, ma resta una conversazione. Quindi ogni incertezza cade dalla
 * parte del rispondere:
 *
 * - i bracci concordano → si risponde, senza nemmeno chiedere (e senza spendere
 *   token: ADR-095, anche quelli locali scalano dal salvadanaio);
 * - niente ricordi → non c'è niente da giudicare, e non c'è niente da dire;
 * - il modello è giù, lento, o risponde qualcosa che non si capisce → si
 *   risponde. Un giudice che non c'è non deve poter zittire UGO.
 */
export async function canAnswer(
  deps: CanAnswerDeps,
  question: string,
  ranked: readonly RankedMemory[],
): Promise<AnswerableVerdict> {
  if (ranked.length === 0) return { answerable: false, asked: false };
  if (armsAgree(ranked)) return { answerable: true, asked: false };

  const shown = ranked.slice(0, deps.limit ?? ranked.length).map((memory) => memory.text);
  const said = await deps.local.generate(judgePrompt(question, shown), 8);
  return { answerable: readVerdict(said), asked: true, said };
}
