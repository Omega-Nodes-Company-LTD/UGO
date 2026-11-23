/**
 * Il nome scritto combacia con quello scelto?
 *
 * Stesso patto del congedo (ADR-075): **un click solo non è un consenso a una
 * cosa irreversibile**. Tollerante sugli spazi e sulle maiuscole, perché una
 * tastiera a schermo le sbaglia; intollerante su tutto il resto, perché è
 * l'ultimo passo prima di una cosa che non si torna indietro.
 *
 * Qui e non in `myData.ts` perché ora lo usano due pannelli (i dati e
 * «porta l'anima a casa»), e un import dall'uno all'altro sarebbe un ciclo.
 */
export function nameMatches(typed: string, chosen: string): boolean {
  const clean = (value: string): string => value.trim().toLowerCase().replace(/\s+/gu, " ");
  return clean(typed) !== "" && clean(typed) === clean(chosen);
}
