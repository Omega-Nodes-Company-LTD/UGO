import { gosini, traitSets, type DbClient } from "@ugo/db";
import {
  canMate,
  CEPPI,
  drawLitterSize,
  expressedTraits,
  founderGenome,
  GENE_KEYS,
  mate,
  mulberry32,
  screen,
  type Allele,
  type GeneKey,
  type Genome,
  type MateVerdict,
} from "@ugo/psyche";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { characterFrom } from "./council/character.js";

/**
 * The bridge between `trait_sets.traits` (jsonb) and the genetic engine
 * (ADR-069): the one place that decides how a stored trait set becomes a
 * Genome. Everything here is still pure except `loadParents`, which reads.
 */

/**
 * A founder has no ceppo in its jsonb: derive one from the exemplar's id —
 * deterministic, stable across restarts, and it spreads founders over the
 * ceppi without touching their immutable trait sets (ADR-015).
 */
export function deriveCeppo(gosinoId: string): number {
  const head = gosinoId.replaceAll("-", "").slice(0, 8);
  const parsed = Number.parseInt(head, 16);
  return Number.isFinite(parsed) ? Math.abs(parsed) % CEPPI : 0;
}

const isAllele = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);

/** jsonb in, Genome out: alleles when valid, homozygous founder otherwise. */
export function genomeFromStoredTraits(stored: unknown, gosinoId: string): Genome {
  const record: Record<string, unknown> =
    typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};

  const rawCeppo = record.ceppo;
  const ceppo =
    typeof rawCeppo === "number" && Number.isInteger(rawCeppo) && rawCeppo >= 0 && rawCeppo < CEPPI
      ? rawCeppo
      : deriveCeppo(gosinoId);

  const rawAlleles = record.alleles;
  if (typeof rawAlleles === "object" && rawAlleles !== null) {
    const candidate = rawAlleles as Record<string, unknown>;
    if (GENE_KEYS.every((key) => isAllele(candidate[key]))) {
      const alleles = {} as Record<GeneKey, Allele>;
      for (const key of GENE_KEYS) {
        alleles[key] = candidate[key] as [number, number];
      }
      return { ceppo, alleles };
    }
  }

  const scalars: Partial<Record<GeneKey, number>> = {};
  for (const key of GENE_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) scalars[key] = value;
  }
  return founderGenome(scalars, ceppo);
}

export interface Parent {
  id: string;
  name: string;
  generation: number;
  genome: Genome;
}

/**
 * The parents of a litter: alive, of this house, latest genome version each.
 * `undefined` when any id is missing — the caller answers 404 without saying
 * whether the stranger's id exists (a house that is not yours looks empty).
 */
export async function loadParents(
  db: DbClient,
  accountId: string,
  parentIds: readonly string[],
): Promise<Parent[] | undefined> {
  const rows = await db
    .select({ id: gosini.id, name: gosini.name, generation: gosini.generation })
    .from(gosini)
    .where(
      and(
        eq(gosini.accountId, accountId),
        inArray(gosini.id, [...parentIds]),
        isNull(gosini.retiredAt),
      ),
    );
  if (rows.length !== parentIds.length) return undefined;

  const parents: Parent[] = [];
  for (const id of parentIds) {
    const row = rows.find((r) => r.id === id);
    if (row === undefined) return undefined;
    const [latest] = await db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, id))
      .orderBy(desc(traitSets.version))
      .limit(1);
    parents.push({ ...row, genome: genomeFromStoredTraits(latest?.traits, id) });
  }
  return parents;
}

export interface CubPreview {
  index: number;
  viable: boolean;
  reasons?: string[];
  persona: string;
  traits: Record<GeneKey, number>;
}

export interface LitterPreview {
  seed: number;
  cubs: CubPreview[];
  genomes: Genome[];
}

/**
 * Same parents + same seed = same litter: the preview is arithmetic, not memory.
 *
 * ADR-103: **quanti** non è più un parametro. La taglia esce dallo stesso
 * flusso di dadi che fa i genomi, e per prima — così il seme determina la
 * cucciolata *intera*, numero compreso, e nessun chiamante può chiedere «fammene
 * otto». Il dado si legge prima dei genomi: invertire l'ordine cambierebbe
 * silenziosamente ogni cucciolata già vista in anteprima.
 */
export function previewLitter(
  parents: readonly Parent[],
  seed: number,
): LitterPreview | { refused: Exclude<MateVerdict, { ok: true }> } {
  const genomes = parents.map((p) => p.genome);
  const verdict = canMate(genomes);
  if (!verdict.ok) return { refused: verdict };

  const rand = mulberry32(seed);
  const litterSize = drawLitterSize(rand);
  const litter = mate(genomes, { rand, litterSize });
  const cubs = litter.map((genome, index) => {
    const expressed = expressedTraits(genome);
    const health = screen(genome);
    return {
      index,
      viable: health.viable,
      ...(health.viable ? {} : { reasons: health.reasons }),
      persona: characterFrom(expressed).persona,
      traits: expressed,
    };
  });
  return { seed, cubs, genomes: litter };
}
