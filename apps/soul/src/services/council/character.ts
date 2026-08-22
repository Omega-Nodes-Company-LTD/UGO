import { z } from "zod";

/**
 * The genome, finally driving something (ADR-031).
 *
 * `trait_sets` has existed since ADR-015 and has never piloted anything, which
 * meant two exemplars in the same house were two identical copies with
 * different memories. A council of identical copies is an echo, not a
 * discussion — so this is the piece that has to come first.
 *
 * Pure: traits in, character out. Everything downstream (the psyche baselines,
 * the body proportions, the line of persona in the prompt) is derived here, so
 * there is exactly one place where "who is this one" is decided.
 */

/** Everything is optional and defaulted: an empty genome is a plain UGO. */
export const traitsSchema = z.object({
  // the body (the same dials the renderer already exposes, ADR-026)
  chonk: z.number().min(0).max(1).default(0.62),
  ear: z.number().min(0).max(1).default(0.55),
  snout: z.number().min(0).max(1).default(0.55),
  eye: z.number().min(0).max(1).default(0.5),
  leg: z.number().min(0).max(1).default(0.45),
  hue: z.number().min(0).max(1).default(0.95),
  // the coat and the tail (ADR-068): spots are recessive, hence rare
  spots: z.number().min(0).max(1).default(0.1),
  tail: z.number().min(0).max(1).default(0.5),
  // le setole (ADR-109): dalla cresta rada al dorso irto
  bristle: z.number().min(0).max(1).default(0.35),
  // the character
  curiosity: z.number().min(0).max(1).default(0.5),
  boldness: z.number().min(0).max(1).default(0.5),
  affection: z.number().min(0).max(1).default(0.5),
  calm: z.number().min(0).max(1).default(0.5),
  talkativeness: z.number().min(0).max(1).default(0.5),
  // how long the arc lasts (ADR-071): a founder is average, no migration
  longevity: z.number().min(0).max(1).default(0.5),
});

export type Traits = z.infer<typeof traitsSchema>;

export interface Character {
  traits: Traits;
  /** one line of who he is, for the prompt — Italian, because he is */
  persona: string;
  /** where his psyche sits when nothing is happening */
  baselines: { umore: number; affetto: number; noia: number; stress: number; curiosita: number };
  /** how long he talks: a shy one does not deliver a lecture */
  maxWords: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Picks the phrase for where a dial sits. Three bands: nothing subtler reads. */
function band(value: number, low: string, mid: string, high: string): string | undefined {
  if (value < 0.3) return low;
  if (value > 0.7) return high;
  return value > 0.45 && value < 0.55 ? undefined : mid;
}

export function characterFrom(raw: unknown): Character {
  const traits = traitsSchema.parse(raw ?? {});
  const notes = [
    band(traits.curiosity, "poco curioso, gli basta quello che sa", "curioso", "curiosissimo, vuole sapere tutto"),
    band(traits.boldness, "timido, si tira indietro", "prudente", "sfacciato, dice quello che pensa"),
    band(traits.affection, "distaccato", "affettuoso", "appiccicoso, ti sta addosso"),
    band(traits.calm, "nervoso, si agita per poco", "tranquillo", "flemmatico, non si scompone mai"),
    band(traits.talkativeness, "di poche parole", "chiacchierone", "logorroico"),
  ].filter((note): note is string => note !== undefined);

  return {
    traits,
    persona:
      notes.length === 0 ? "Carattere nella media, senza spigoli." : `Sei ${notes.join(", ")}.`,
    baselines: {
      // a bold, curious pig starts from a better mood and gets bored sooner
      umore: clamp(0.55 + (traits.boldness - 0.5) * 0.2, 0.25, 0.8),
      affetto: clamp(0.5 + (traits.affection - 0.5) * 0.5, 0.1, 0.9),
      noia: clamp(0.4 + (traits.curiosity - 0.5) * 0.3, 0.15, 0.75),
      stress: clamp(0.3 - (traits.calm - 0.5) * 0.35, 0.05, 0.7),
      curiosita: clamp(0.5 + (traits.curiosity - 0.5) * 0.6, 0.1, 0.95),
    },
    maxWords: Math.round(18 + traits.talkativeness * 42),
  };
}

/** A few ready-made characters, so making a second one is not a form to fill. */
export const ARCHETYPES: Readonly<Record<string, Partial<Traits>>> = {
  curiosone: { curiosity: 0.95, boldness: 0.7, talkativeness: 0.75, calm: 0.4, ear: 0.8 },
  pigrone: { curiosity: 0.2, boldness: 0.3, calm: 0.9, talkativeness: 0.25, chonk: 0.95, leg: 0.2 },
  affettuoso: { affection: 0.95, calm: 0.7, talkativeness: 0.6, curiosity: 0.45, eye: 0.8 },
  brontolone: { boldness: 0.85, affection: 0.25, calm: 0.3, talkativeness: 0.7, hue: 0.05 },
  timidone: { boldness: 0.1, calm: 0.25, talkativeness: 0.15, affection: 0.6, snout: 0.25 },
};
