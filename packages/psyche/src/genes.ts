/**
 * The gene catalog and its expression (ADR-068).
 *
 * The genome is diploid: every gene carries two alleles in [0,1], and the
 * *expressed* value — what the renderer, the psyche baselines and the persona
 * actually read — depends on the gene's expression mode. Recessive genes are
 * what makes rarity emerge from genetics instead of from a counter: spots show
 * only when BOTH alleles are high.
 *
 * Serialization is a superset of the `trait_sets.traits` jsonb already in
 * production: expressed values keep their old scalar keys (existing readers
 * parse them unchanged, Zod strips the rest), while `ceppo` and `alleles`
 * ride along for the engine. A trait set without `alleles` is a founder:
 * homozygous by construction.
 */

export const GENE_KEYS = [
  // the body (the dials the renderer already reads, ADR-026, plus the new coat)
  "chonk",
  "ear",
  "snout",
  "eye",
  "leg",
  "hue",
  "spots",
  "tail",
  // the character
  "curiosity",
  "boldness",
  "affection",
  "calm",
  "talkativeness",
  // how long the arc lasts (ADR-071): hamster scale, 2.5–5 years
  "longevity",
] as const;

export type GeneKey = (typeof GENE_KEYS)[number];

export type Expression = "blend" | "dominant" | "recessive";

/** Two alleles; order carries no meaning. */
export type Allele = readonly [number, number];

export interface Genome {
  /** compatibility locus (ADR-068 §3): 0..CEPPI-1, never a sex */
  ceppo: number;
  alleles: Record<GeneKey, Allele>;
}

/** Eight mating types, alla Schizophyllum — breeding needs distinct ceppi. */
export const CEPPI = 8;

/** Defaults mirror `traitsSchema` (character.ts): an empty genome is a plain UGO. */
export const GENE_CATALOG: Record<GeneKey, { default: number; expression: Expression }> = {
  chonk: { default: 0.62, expression: "blend" },
  ear: { default: 0.55, expression: "blend" },
  snout: { default: 0.55, expression: "blend" },
  eye: { default: 0.5, expression: "blend" },
  leg: { default: 0.45, expression: "blend" },
  hue: { default: 0.95, expression: "blend" },
  // coat spots are recessive: the rare phenotype breeders will chase
  spots: { default: 0.1, expression: "recessive" },
  tail: { default: 0.5, expression: "blend" },
  curiosity: { default: 0.5, expression: "blend" },
  // one bold allele is enough to speak up
  boldness: { default: 0.5, expression: "dominant" },
  affection: { default: 0.5, expression: "blend" },
  calm: { default: 0.5, expression: "blend" },
  talkativeness: { default: 0.5, expression: "blend" },
  longevity: { default: 0.5, expression: "blend" },
};

/** Epistasis, declared once: shyness masks the talkative gene (ADR-068 §2). */
export const TALKATIVENESS_EPISTASIS = { boldnessBelow: 0.2, cap: 0.35 } as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function expressGene(key: GeneKey, allele: Allele): number {
  const [a, b] = allele;
  switch (GENE_CATALOG[key].expression) {
    case "dominant":
      return Math.max(a, b);
    case "recessive":
      return Math.min(a, b);
    case "blend":
      return (a + b) / 2;
  }
}

/** Genotype → phenotype: per-gene expression, then the epistatic mask. */
export function expressedTraits(genome: Genome): Record<GeneKey, number> {
  const expressed = {} as Record<GeneKey, number>;
  for (const key of GENE_KEYS) {
    expressed[key] = expressGene(key, genome.alleles[key]);
  }
  if (expressed.boldness < TALKATIVENESS_EPISTASIS.boldnessBelow) {
    expressed.talkativeness = Math.min(expressed.talkativeness, TALKATIVENESS_EPISTASIS.cap);
  }
  return expressed;
}

/**
 * The jsonb payload for `trait_sets.traits`: expressed values under their
 * historical keys (today's readers keep working untouched), genotype alongside.
 */
export function toTraitSet(genome: Genome): Record<string, unknown> {
  return { ...expressedTraits(genome), ceppo: genome.ceppo, alleles: genome.alleles };
}

/**
 * A pre-ADR-068 trait set becomes a genome: homozygous on every gene, so the
 * expressed values are exactly the scalars the creature already lived with.
 */
export function founderGenome(
  traits?: Partial<Record<GeneKey, number>>,
  ceppo = 0,
): Genome {
  const alleles = {} as Record<GeneKey, Allele>;
  for (const key of GENE_KEYS) {
    const value = clamp01(traits?.[key] ?? GENE_CATALOG[key].default);
    alleles[key] = [value, value];
  }
  return { ceppo, alleles };
}
