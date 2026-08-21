import { PROP_KINDS, type PropKind } from "@ugo/shared/props";

/**
 * Il giocattolo preferito viene dal genoma (gruppo 10).
 *
 * La preferenza fra arredi NON si impara, e la scelta è deliberata: l'evento
 * `used_prop` scarica noia per costruzione, quindi qualunque peso «imparato»
 * dall'esito imparerebbe rumore — ogni oggetto funzionerebbe, e i pesi
 * andrebbero dove li porta il caso. La decide invece il **carattere**, che è
 * dei `trait_sets` (ADR-015/031): l'ardito gioca con la palla, il flemmatico
 * ama il cuscino, il curioso grufola nell'erba, il mangione sta sul truogolo,
 * il timido bazzica il cespuglio. Due gosini nella stessa stanza sviluppano
 * posti preferiti diversi — individualità vera, zero motori nuovi.
 *
 * I pesi sono MOLTIPLICATORI sulla distanza percepita (`Wanderer.nearest`):
 * un arredo amato «sembra più vicino». Stretti attorno a 1 apposta: il
 * carattere inclina, non comanda — un maiale che attraversa sempre tutta la
 * stanza ignorando il cuscino a un passo non è uno con dei gusti, è uno
 * rotto. E la paura non fa shopping: la scelta del riparo sotto stress resta
 * il più vicino e basta.
 */

/** Oltre questi limiti il gusto smette di essere un'inclinazione. */
const TASTE_MIN = 0.6;
const TASTE_MAX = 1.5;

/**
 * Che tratti pesano su quale arredo. I nomi sono quelli di `traitsSchema`
 * (`character.ts`); un genoma senza quel tratto vale 0.5, il neutro — così
 * una casa senza genoma ha esattamente il comportamento di prima.
 */
const LEANINGS: Readonly<Record<PropKind, readonly (readonly [string, number])[]>> = {
  ball: [
    ["boldness", 0.8],
    ["curiosity", 0.4],
  ],
  cushion: [
    ["calm", 0.8],
    ["chonk", 0.4],
  ],
  grass: [["curiosity", 0.8]],
  trough: [["chonk", 0.8]],
  bush: [["boldness", -0.8]],
};

const clamp = (value: number): number => Math.min(TASTE_MAX, Math.max(TASTE_MIN, value));

export function tastesFrom(traits: object | undefined): Record<PropKind, number> {
  // il genoma arriva dal roster come record largo (`Record<string, number>`),
  // ma dentro il corpo viaggia tipato sui soli tratti del disegno: qui serve
  // il sacco intero, e il cast è il punto DICHIARATO in cui lo si riapre
  const bag = (traits ?? {}) as Record<string, number | undefined>;
  const of = (name: string): number => {
    const value = bag[name];
    return typeof value === "number" && Number.isFinite(value) ? value : 0.5;
  };
  const tastes = {} as Record<PropKind, number>;
  for (const kind of PROP_KINDS) {
    let weight = 1;
    for (const [trait, span] of LEANINGS[kind]) weight += (of(trait) - 0.5) * span;
    tastes[kind] = clamp(weight);
  }
  return tastes;
}
