/**
 * «Riferire non è rispondere» (ADR-108).
 *
 * Il proprietario, il 2026-08-19, sul caso che il banco contava come persa:
 *
 * > «lui non può dare consigli medici, ma deve ricordare se io dico che
 * > "giovanni ha l'asma", non perché sia un fatto medico, ma perché io l'ho
 * > detto. La risposta alla domanda "X può fare Y" è un problema in generale:
 * > se anche non fosse allergico ai crostacei, magari lo è alle noci e non te
 * > lo ha mai detto.»
 *
 * Dentro ci sono due cose, e sono tutt'e due vere.
 *
 * **La prima**: ricordare «Sofia è allergica ai crostacei» non è un atto
 * medico, è ricordare una frase. Il ricordo esiste perché qualcuno l'ha detto,
 * e tacerlo è il danno peggiore che UGO possa fare in quella conversazione.
 *
 * **La seconda**, che è quella che rompe il criterio del giudice: a «X può
 * fare Y» **non esiste una risposta ricavabile dalla memoria**, mai — nemmeno
 * con la memoria perfetta. L'assenza di un appunto non è l'assenza della
 * condizione. Quindi «sì, può» è sempre un'invenzione e «non lo so» è sempre
 * una reticenza: la terza mossa, la sola vera, è **riferire** ciò che si è
 * sentito dire e dichiarare il confine di ciò che si sa.
 *
 * Da qui la regola: le domande di questa forma **non si danno da giudicare**.
 * Il giudice di ADR-107 sceglie fra rispondere e tacere, e su queste tutt'e
 * due le scelte sono sbagliate.
 */

/** Toglie gli accenti, così `\b` (che è ASCII) funziona anche su «può». */
const plain = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");

/** Il modale: chiede un permesso, una capacità, una possibilità su qualcuno. */
const MODAL = /\b(puo|posso|possiamo|possono|puoi|potete|potrebbe|potrei|potremmo)\b/u;

/** Il merito: chiede se una cosa è prudente, e la prudenza non sta in un appunto. */
const SAFETY = /\b(sicuro|pericoloso|rischia|rischioso|allergic\w*)\b|\bfa male\b|\bva bene se\b/u;

/**
 * «Come posso …» non chiede un verdetto su una persona, chiede istruzioni: è
 * l'unico caso in cui il modale non conta.
 */
const HOW_TO = /^come\b/u;

/**
 * La domanda chiede un verdetto invece di un ricordo?
 *
 * **Il riconoscimento è volutamente largo, e sbaglia da una parte sola.** Un
 * falso positivo fa entrare i ricordi in una domanda qualunque — cioè il
 * comportamento che c'era prima di ADR-107, che è stato quello di tutta la
 * vita di UGO fino a ieri. Un falso negativo, invece, rimette la domanda in
 * mano al giudice, e quello può zittire un'allergia. Fra i due si sceglie
 * sempre il primo, e per questo la rete vera non è questa funzione: è la
 * regola 8 del blocco cached, che vale su ogni domanda anche quando qui non
 * si riconosce niente.
 */
export function asksForAVerdict(question: string): boolean {
  const text = plain(question).trim();
  if (HOW_TO.test(text)) return false;
  return MODAL.test(text) || SAFETY.test(text);
}
