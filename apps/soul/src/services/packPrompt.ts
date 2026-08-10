import type { PresentBeing, SelfView } from "./packService.js";

/**
 * Blocks 3-bis of the §5.5 order: who I am, who is here, how they relate to
 * each other, what the species rules are, what I have been corrected on.
 * Dynamic by nature — therefore never marked for caching.
 */

const FAMILIARITY_WORDS: readonly [number, string][] = [
  [0.75, "vi conoscete bene"],
  [0.4, "vi conoscete un po'"],
  [0, "l'hai visto poche volte"],
];

const AFFINITY_WORDS: readonly [number, string][] = [
  [0.3, "ti sta simpatico"],
  [-0.3, "neutro"],
  [-1, "ti mette a disagio"],
];

function describe(scale: readonly [number, string][], value: number): string {
  for (const [threshold, word] of scale) {
    if (value >= threshold) return word;
  }
  return scale[scale.length - 1]?.[1] ?? "";
}

export interface PackPromptInput {
  self: SelfView;
  present: readonly PresentBeing[];
  relations: readonly { a: string; b: string; type: string }[];
  speciesRules: readonly string[];
  corrections: readonly { signal: string; aboutBeing: string | null }[];
  /** true when somebody is in the room but nobody knows who: never guess */
  unidentifiedPresent?: boolean;
}

const RELATION_WORDS: Record<string, string> = {
  parent_of: "è genitore di",
  partner_of: "sta con",
  cares_for: "si prende cura di",
  avoids: "evita",
};

const CORRECTION_WORDS: Record<string, string> = {
  too_loud: "ti hanno detto che parli troppo forte",
  leave_alone: "ti hanno chiesto di lasciare in pace qualcuno",
  good: "ti hanno detto che hai fatto bene",
  wrong_name: "hai sbagliato a chiamare qualcuno per nome",
};

export function buildPackPrompt(input: PackPromptInput): string {
  const { self, present, relations, speciesRules, corrections } = input;
  const lines: string[] = [];

  const where = self.locationLabel === null ? "" : ` in ${self.locationLabel}`;
  const genome = self.traitVersion === null ? "" : ` (tratti v${String(self.traitVersion)})`;
  lines.push(`Sei ${self.name}${where}${genome}.`);

  if (present.length === 0) {
    lines.push("Nel branco adesso non risulta presente nessuno.");
  } else {
    const names = new Map(present.map((being) => [being.id, being.displayName]));
    lines.push(
      "Chi c'è adesso:\n" +
        present
          .map(
            (being) =>
              `- ${being.displayName} (${being.species}): ` +
              `${describe(FAMILIARITY_WORDS, being.familiarity)}, ` +
              describe(AFFINITY_WORDS, being.affinity),
          )
          .join("\n"),
    );
    const edges = relations
      .filter((edge) => names.has(edge.a) && names.has(edge.b))
      .map(
        (edge) =>
          `- ${names.get(edge.a) ?? ""} ${RELATION_WORDS[edge.type] ?? edge.type} ` +
          (names.get(edge.b) ?? ""),
      );
    if (edges.length > 0) lines.push(`Tra loro:\n${edges.join("\n")}`);
  }

  if (input.unidentifiedPresent === true) {
    // ADR-016: a wrong name said with confidence costs more than a question
    lines.push(
      "C'è qualcuno che non hai riconosciuto: non tirare a indovinare chi sia. " +
        "Se c'è un umano di fiducia, chiedi a lui.",
    );
  }

  if (speciesRules.length > 0) {
    lines.push(`Regole con chi hai davanti:\n${speciesRules.map((r) => `- ${r}`).join("\n")}`);
  }

  if (corrections.length > 0) {
    const words = corrections.map((c) => `- ${CORRECTION_WORDS[c.signal] ?? c.signal}`);
    lines.push(`Ti hanno corretto di recente:\n${[...new Set(words)].join("\n")}`);
  }

  return lines.join("\n");
}
