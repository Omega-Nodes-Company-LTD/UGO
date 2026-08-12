import type { LastBlow } from "./engine.js";
import type { PsycheVars } from "./model.js";

/**
 * Threshold mapping vars → short Italian label (PROGETTO §5.3).
 *
 * ADR-040: the startle labels are gated on the **last blow**, not on the total.
 * ADR-033 taught the engine that the tenth bang is not the first, and then the
 * label went on reading only `stress`, which habituation deliberately leaves
 * elevated. The result was a creature permanently described as terrified: the
 * habituated plateau sat above the anxiety threshold, so no amount of getting
 * used to the noise could ever turn the word off. Being startled is an event,
 * and an event is something that just happened and was worth noticing.
 */

/** After this, a bang is something that happened, not something happening. */
export const STARTLE_WINDOW_MS = 120_000;

/** Under this the blow was a repetition the creature has already absorbed. */
const STARTLE_AMOUNT = 0.08;

/** Events whose label is about the fright itself rather than the state. */
const STARTLE_LABELS: Readonly<Record<string, string>> = {
  heat_stress: "in ansia da caldo",
  shake: "offeso per l'urto",
  loud_noise: "spaventato dal fracasso",
};

function startled(blow: LastBlow | undefined): string | undefined {
  if (blow?.cause === undefined) return undefined;
  if (blow.agoMs > STARTLE_WINDOW_MS || blow.amount < STARTLE_AMOUNT) return undefined;
  return STARTLE_LABELS[blow.cause];
}

export function pickLabel(vars: PsycheVars, lastEventType?: string, blow?: LastBlow): string {
  // a fresh blow that actually landed speaks first: this is the moment it is
  // true to say he jumped
  const jumped = startled(blow);
  if (jumped !== undefined) return jumped;

  if (vars.stress >= 0.6) {
    // no blow to go on (a restart loses them) keeps the old flavouring, which
    // is better than dropping the information entirely
    if (blow === undefined && lastEventType !== undefined) {
      const flavoured = STARTLE_LABELS[lastEventType];
      if (flavoured !== undefined) return flavoured;
    }
    return "in ansia";
  }
  if (vars.umore <= 0.4) return "mogio";
  if (vars.energia <= 0.25) return "in letargo";
  if (vars.umore >= 0.7 && vars.energia >= 0.6) return "gasato";
  if (vars.noia >= 0.65) return "annoiato";
  if (vars.curiosita >= 0.7) return "curioso";
  return "sereno";
}

/** One short first-person sentence per label, injected in prompt block 3 (§5.5). */
const LABEL_PHRASES: Readonly<Record<string, string>> = {
  "in ansia da caldo": "Fa troppo caldo per un porcetto, sono in ansia.",
  "offeso per l'urto": "Mi hanno urtato e sono ancora offeso.",
  "spaventato dal fracasso": "C'è stato un fracasso improvviso e ho ancora il cuore a mille.",
  "in ansia": "Oggi sono un po' teso, portami pazienza.",
  mogio: "Sono un po' mogio oggi.",
  "in letargo": "Ho pochissima energia, quasi in letargo.",
  gasato: "Sono gasato come non mai, grugnisco di gioia.",
  annoiato: "Mi sto annoiando parecchio qui da solo.",
  curioso: "Oggi sono curioso: raccontami qualcosa di nuovo.",
  sereno: "Sono sereno e di buon grugno.",
};

export function labelPhrase(label: string): string {
  return LABEL_PHRASES[label] ?? LABEL_PHRASES.sereno ?? "";
}
