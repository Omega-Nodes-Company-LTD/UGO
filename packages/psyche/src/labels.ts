import type { PsycheVars } from "./model.js";

/**
 * Threshold mapping vars → short Italian label (PROGETTO §5.3).
 * Deterministic priority order; stress labels are flavoured by the event
 * that most recently raised stress.
 */
export function pickLabel(vars: PsycheVars, lastEventType?: string): string {
  if (vars.stress >= 0.6) {
    switch (lastEventType) {
      case "heat_stress":
        return "in ansia da caldo";
      case "shake":
        return "offeso per l'urto";
      case "loud_noise":
        return "spaventato dal fracasso";
      default:
        return "in ansia";
    }
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
