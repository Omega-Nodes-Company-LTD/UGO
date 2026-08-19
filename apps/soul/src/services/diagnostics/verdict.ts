/**
 * Come si legge una sonda — PURO, e apposta.
 *
 * `/health` sapeva dire due cose: risponde, non risponde. Con un timeout di
 * mezzo secondo, un container che rispondeva in 4 000 ms era «non risponde»
 * esattamente come uno spento — e le due cose si riparano in modi opposti:
 * uno è morto, l'altro sta arrancando ed è la ragione per cui la risposta
 * arriva dopo un minuto. Fra i due stati ne mancava uno, ed è quello che
 * serviva davvero: **lento**.
 *
 * Sta in un file suo perché è l'unica parte che si può provare senza
 * accendere niente, e perché la soglia di «lento» è una decisione di
 * prodotto: cambiarla non deve voler dire rileggere il codice di rete.
 */

/** Gli stati in cui una sonda può finire. Quattro, non due. */
export const PROBE_STATES = ["ok", "slow", "down", "off"] as const;
export type ProbeState = (typeof PROBE_STATES)[number];

/**
 * Le soglie di una sonda, in millisecondi.
 *
 * `slowMs` non è una taratura fine: è «oltre questo, una persona se ne
 * accorge». `timeoutMs` è quando si smette di aspettare — sempre più largo
 * della soglia di lentezza, o «lento» non potrebbe mai essere osservato.
 */
export interface Thresholds {
  slowMs: number;
  timeoutMs: number;
}

/**
 * Le soglie di casa, per chi non ne dichiara di proprie.
 *
 * Un secondo perché sotto il secondo nessuna dipendenza di questo stack ha
 * una ragione per starci: sono tutte nella stessa rete docker, e un salto in
 * rete locale che costa più di un secondo È il guasto, non la misura di uno.
 */
export const DEFAULT_THRESHOLDS: Thresholds = { slowMs: 1_000, timeoutMs: 4_000 };

/**
 * Quanto pesa una sonda sul verdetto complessivo.
 *
 * `vital` = senza di lui non c'è prodotto (il database). `supporting` = la
 * casa gira lo stesso, peggio (Ollama, la percezione). `optional` = spento è
 * uno stato legittimo e non deve tingere di rosso il pannello — è la lezione
 * di `capabilities.ts`, portata qui: una funzione spenta che finge di essere
 * rotta manda a cercare un guasto dove c'è solo una configurazione.
 */
export type Weight = "vital" | "supporting" | "optional";

export interface ProbeOutcome {
  /** `null` quando non c'era niente da misurare (spento) */
  ms: number | null;
  /** falso = ha risposto male, o non ha risposto affatto */
  reached: boolean;
  /** non configurato: non è un guasto */
  configured: boolean;
}

/**
 * Da quanto è costata la sonda, a che cosa dire.
 *
 * L'ordine conta: prima «non configurato», poi «non risponde», poi la
 * lentezza. Un servizio spento che impiega 3 000 ms a rifiutare la
 * connessione non è lento: è spento.
 */
export function stateOf(outcome: ProbeOutcome, thresholds: Thresholds): ProbeState {
  if (!outcome.configured) return "off";
  if (!outcome.reached || outcome.ms === null) return "down";
  return outcome.ms > thresholds.slowMs ? "slow" : "ok";
}

export interface WeighedState {
  state: ProbeState;
  weight: Weight;
}

/** Il verdetto della casa in una parola. */
export type Verdict = "ok" | "degraded" | "unavailable";

/**
 * Il verdetto complessivo.
 *
 * Un vitale giù è «unavailable» e non ammette sfumature. Tutto il resto —
 * un supporto giù, chiunque lento — è «degraded»: la parola esiste proprio
 * per il caso in cui il prodotto risponde e risponde male, che è lo stato in
 * cui questo pannello viene aperto nove volte su dieci.
 *
 * Un `optional` spento non conta. Un `optional` **acceso e rotto** sì: chi ha
 * acceso una cosa si aspetta che funzioni.
 */
export function verdictOf(states: readonly WeighedState[]): Verdict {
  if (states.some((s) => s.weight === "vital" && s.state !== "ok" && s.state !== "slow")) {
    return "unavailable";
  }
  return states.some((s) => s.state === "down" || s.state === "slow") ? "degraded" : "ok";
}
