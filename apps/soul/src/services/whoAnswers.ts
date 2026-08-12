/**
 * Which of them answers (ADR-040).
 *
 * One creature answers a sentence, not all of them — that is the budget rule
 * (CLAUDE.md rule 3), and it is right. What was wrong is that "one" had been
 * written as "the first in the list", and the list comes back ordered by
 * `bornAt`. So the eldest answered every single time and the others never
 * spoke: the owner watched two creatures in a room and only ever heard from
 * ugo-prime.
 *
 * Who speaks up is a question about character, and the genome already answers
 * it: a talkative, bold creature interrupts more. So the pick is weighted by
 * those two traits rather than uniform — which is both truer and more useful,
 * because it makes the genome audible instead of only visible.
 */

/** What choosing needs to know. Anything else about a creature is irrelevant. */
export interface Candidate {
  id: string;
  traits?: Record<string, number> | undefined;
}

/** A trait that is missing is a middling trait, not a zero. */
const MIDDLING = 0.5;

/**
 * How eager this one is to be the one who answers.
 *
 * Kept above zero on purpose: a shy creature speaks *rarely*, never *never*.
 * A weight of zero would reintroduce the bug this fixes, for that creature.
 */
export function eagerness(candidate: Candidate): number {
  const traits = candidate.traits ?? {};
  const talkativeness = traits.talkativeness ?? MIDDLING;
  const boldness = traits.boldness ?? MIDDLING;
  return 0.2 + 0.8 * (0.65 * talkativeness + 0.35 * boldness);
}

/**
 * Pick one, weighted by eagerness.
 *
 * `roll` is injected rather than drawn here so this stays a pure function with
 * a real test: the interesting property is the *distribution*, and a function
 * that reaches for `Math.random` internally cannot be asked about it.
 */
export function whoAnswers<T extends Candidate>(candidates: T[], roll: number): T[] {
  const first = candidates[0];
  if (first === undefined) return [];
  if (candidates.length === 1) return [first];

  const weights = candidates.map(eagerness);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.min(Math.max(roll, 0), 0.999_999) * total;
  for (const [index, weight] of weights.entries()) {
    cursor -= weight;
    if (cursor < 0) {
      const chosen = candidates[index];
      if (chosen !== undefined) return [chosen];
    }
  }
  // floating point ran out of road: the last one is as good an answer as any
  return [candidates[candidates.length - 1] ?? first];
}
