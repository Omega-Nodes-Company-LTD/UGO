import type { LocalTextClient } from "./localText.js";
import type { RankedMemory } from "./rerank.js";
import { asksForAVerdict } from "./reporting.js";

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
  /**
   * ADR-108: la domanda chiede un verdetto su qualcuno («X può fare Y»), e a
   * quella la memoria non risponde né tace — **riferisce**. I ricordi entrano
   * (`answerable` è vero) ma con l'obbligo di dire anche il confine di ciò che
   * si sa.
   */
  reporting: boolean;
  /** la parola grezza del modello, per il banco e per i log: mai per l'utente */
  said?: string | undefined;
}

/**
 * La domanda al modello di casa, in italiano e a risposta chiusa.
 *
 * Volutamente **senza** chiedergli la risposta: gli si chiede solo se la
 * risposta è lì dentro. Un giudice che risponde nel merito diventa un secondo
 * generatore, con un secondo modo di sbagliare e il doppio dei token.
 *
 * **L'ultima riga sembra contraddire l'asimmetria degli errori, e non la
 * contraddice: la tiene.** Spinge verso il no, mentre il codice intorno fa
 * cadere ogni dubbio verso il sì — ma è quella riga a comprare `inventate 0/10`
 * su un corpus pieno di near-miss, cioè a impedire che «la password della rete
 * wifi Cinghiale» venga risposta col nome della rete.
 *
 * **È stato provato a toglierla, ed è andata peggio** (ADR-107, run 32219952282):
 * riscritta in «SI anche indirettamente, NO solo se non c'è proprio», le perse
 * sono passate da **1 a 3** su dieci — un modello da 1.5 miliardi di parametri
 * non diventa più accurato se gli si danno due istruzioni invece di una, si
 * confonde. Il testo è tornato a quello che ha misurato meglio.
 *
 * La domanda che restava persa in **entrambe** le versioni era «Sofia può
 * mangiare i gamberi?» contro «Sofia è allergica ai crostacei». Sembrava un
 * limite del modello — da gamberi a crostacei serve un passaggio di conoscenza
 * del mondo — ed era invece una domanda mal posta al giudice: ADR-108 l'ha
 * tolta di qui, perché a «X può fare Y» non risponde nessun appunto. Questo
 * prompt vale per le domande che una risposta ce l'hanno o non ce l'hanno.
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
    "Rispondi NO se la risposta non c'e, anche se gli appunti parlano di cose vicine.",
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
  /**
   * Basta `generate`: il giudice non ha bisogno di `available`, e chiedere
   * l'interfaccia intera costringerebbe ogni chiamante a portarsi dietro un
   * metodo che qui non serve.
   */
  local: Pick<LocalTextClient, "generate">;
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
 * - la domanda chiede un verdetto su qualcuno → si **riferisce** (ADR-108): non
 *   è un caso di rispondere-o-tacere e non si giudica;
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
  if (ranked.length === 0) return { answerable: false, asked: false, reporting: false };
  /**
   * ADR-108, e sta **prima** dell'accordo dei bracci di proposito: su una
   * domanda che chiede un verdetto non c'è niente da giudicare, quindi non si
   * chiede — né al modello (ADR-095: anche i token di casa costano) né a un
   * indizio. I ricordi entrano e a UGO si dice di riferirli.
   */
  if (asksForAVerdict(question)) return { answerable: true, asked: false, reporting: true };
  if (armsAgree(ranked)) return { answerable: true, asked: false, reporting: false };

  const shown = ranked.slice(0, deps.limit ?? ranked.length).map((memory) => memory.text);
  /**
   * **Temperatura zero, e non è un dettaglio.**
   *
   * Il client nasceva a 0.8, che è la temperatura del cantastorie: giusta per
   * inventare una favola, disastrosa per un giudizio. Un giudice che campiona
   * dà verdetti diversi sulla stessa domanda a ogni giro — e infatti tre
   * «misure» di ADR-107 fatte prima di accorgersene confrontavano estrazioni,
   * non configurazioni. Qui si vuole la stessa risposta ogni volta.
   */
  const said = await deps.local.generate(judgePrompt(question, shown), 8, { temperature: 0 });
  return { answerable: readVerdict(said), asked: true, reporting: false, said };
}
