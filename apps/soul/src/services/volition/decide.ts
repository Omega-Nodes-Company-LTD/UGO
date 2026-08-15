import { ACTS, type Act } from "./acts.js";
import type { Pressure } from "./pressures.js";

/**
 * The decision — PURE.
 *
 * Given what is pushing and what he could do about it, pick one act, or pick
 * none. Doing nothing is a real candidate here, not a fallthrough: a companion
 * that acts on every tick is a companion you unplug by Wednesday.
 *
 * The shape is deliberately dull — score, threshold, gates — because the point
 * is that it is inspectable. Every initiative can be explained afterwards with
 * the numbers that produced it, which is the difference between a character
 * and a bug.
 */

export interface Gates {
  /** a body is connected */
  bodyPresent: boolean;
  /** the local model answered a ping recently */
  localModelUp: boolean;
  /** there is at least one desire waiting to be said */
  hasDesire: boolean;
  /** hour of day: he does not wake the house */
  hour: number;
  /** minutes since his last initiative of any kind */
  minutesSinceInitiative: number;
  /** minutes since each act was last used, by act id */
  sinceAct: Readonly<Record<string, number>>;
  /** the owner switched initiative off entirely */
  enabled: boolean;
}

export interface Decision {
  act: Act;
  /** the pressure it is answering — the "why" that gets logged */
  driver: Pressure;
  score: number;
}

/** Quiet by night: nothing that demands attention between these hours. */
export const QUIET_FROM = 22;
export const QUIET_TO = 8;
/** Floor between two initiatives of any kind. */
export const MIN_GAP_MIN = 6;
/** Below this, doing nothing wins. */
export const THRESHOLD = 0.22;
/**
 * Quanto costa, in punteggio, disturbare qualcuno.
 *
 * Esportata da ADR-058 per un test e non per un chiamante: è la costante che
 * permette di provare che il peso di efficacia ha toccato **solo il sollievo** e
 * non questa penalità — cioè la valvola che impedisce a UGO di imparare a
 * scocciare. Un test che non potesse dividere i due termini proverebbe che il
 * punteggio è salito, che non è la stessa cosa.
 */
export const ATTENTION_WEIGHT = 0.45;

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_FROM || hour < QUIET_TO;
}

function feasible(act: Act, gates: Gates): boolean {
  if (act.needsBody === true && !gates.bodyPresent) return false;
  if (act.needsDesire === true && !gates.hasDesire) return false;
  if (act.needsLocalModel === true && !gates.localModelUp) return false;
  const since = gates.sinceAct[act.id] ?? Number.POSITIVE_INFINITY;
  if (since < act.cooldownMin) return false;
  // at night only the quiet end of the repertoire is allowed through
  if (isQuietHour(gates.hour) && act.intrusive > 0.25) return false;
  return true;
}

/**
 * Best act for the pressures at hand, or `undefined` for "not now".
 *
 * Scoring is a single line on purpose: expected relief of what is actually
 * pushing, minus what it costs the person in the room.
 */
export function decide(
  list: readonly Pressure[],
  gates: Gates,
  catalogue: readonly Act[] = ACTS,
  /**
   * ADR-058: quanto bene gli è andata, atto per atto. Assente = tutti a 1, che
   * è **esattamente** ciò che faceva prima — ed è il motivo per cui ogni test
   * esistente su `decide()` resta verde senza toccarlo.
   *
   * ⚠️ Non è apprendimento in nessun senso generale: è un peso di preferenza su
   * nove atti cablati, limitato a ±40%, che decade verso 1 ogni notte.
   */
  efficacy: Readonly<Record<string, number>> = {},
): Decision | undefined {
  if (!gates.enabled) return undefined;
  if (gates.minutesSinceInitiative < MIN_GAP_MIN) return undefined;
  if (list.length === 0) return undefined;

  let best: Decision | undefined;
  for (const act of catalogue) {
    if (!feasible(act, gates)) continue;
    let relief = 0;
    let driver: Pressure | undefined;
    let bestContribution = 0;
    for (const pressure of list) {
      const fraction = act.relieves[pressure.id] ?? 0;
      const contribution = pressure.magnitude * fraction;
      relief += contribution;
      if (contribution > bestContribution) {
        bestContribution = contribution;
        driver = pressure;
      }
    }
    if (driver === undefined) continue;
    // ADR-058. **L'ordine dei fattori è la decisione portante, non stile.** Il
    // peso moltiplica il **sollievo**, mai la penalità di invadenza, e da lì
    // discendono le tre valvole di sicurezza:
    //
    // 1. un atto invadente **non può imparare a smettere di esserlo**:
    //    `askQuestion` resta penalizzato comunque vada;
    // 2. l'apprendimento **riordina atti di punteggio simile, non fabbrica
    //    iniziative**: `THRESHOLD` è invariato, e un peso 1.4 su un sollievo di
    //    0.15 continua a perdere contro il non far niente;
    // 3. `cooldownMin`, `MIN_GAP_MIN` e le ore di quiete non si toccano — la
    //    lode può cambiare *cosa* fa, mai *quanto spesso*.
    const score = relief * (efficacy[act.id] ?? 1) - act.intrusive * ATTENTION_WEIGHT;
    if (score > (best?.score ?? THRESHOLD)) best = { act, driver, score };
  }
  return best;
}
