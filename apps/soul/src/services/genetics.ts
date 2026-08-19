import { gosini, traitSets, type DbClient } from "@ugo/db";
import {
  canMate,
  CEPPI,
  drawLitterSize,
  expressedTraits,
  founderGenome,
  GENE_CATALOG,
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

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

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

  /**
   * ADR-109: si legge **locus per locus**, e il locus che manca non è un
   * genoma da buttare.
   *
   * Qui c'era un `every`: la mappa degli alleli valeva solo se c'erano tutti,
   * e un gene in meno la faceva scartare intera — il genoma veniva ricostruito
   * omozigote dai valori **espressi**, cioè da quello che si vede addosso.
   * Finché il catalogo non cambia non succede niente; ma i geni si aggiungono
   * (ADR-068 ne ha messi due, ADR-071 uno), e ogni aggiunta rendeva di colpo
   * incompleto **ogni genoma già scritto**. Il risultato non era un errore: era
   * un allele portato e non mostrato — lo `spots` recessivo, cioè precisamente
   * la rarità che ADR-068 voleva far emergere — che spariva in silenzio, e alla
   * prima riscrittura di `trait_sets` spariva per sempre.
   *
   * Adesso ogni locus valido si tiene com'è, e solo quelli assenti o malformati
   * si riempiono dal catalogo, omozigoti. Un locus rotto non contagia i vicini:
   * non hanno colpe.
   *
   * Resta intatta la strada di prima per i trait set scritti **prima** di
   * ADR-068, che di `alleles` non ne hanno affatto: lì la ricostruzione
   * omozigote dagli scalari è giusta, perché non c'è nessun genotipo da perdere.
   */
  const rawAlleles = record.alleles;
  if (typeof rawAlleles === "object" && rawAlleles !== null) {
    const candidate = rawAlleles as Record<string, unknown>;
    if (GENE_KEYS.some((key) => isAllele(candidate[key]))) {
      const alleles = {} as Record<GeneKey, Allele>;
      for (const key of GENE_KEYS) {
        const stored = candidate[key];
        if (isAllele(stored)) {
          alleles[key] = stored;
          continue;
        }
        const scalar = record[key];
        const fallback = clamp01(
          typeof scalar === "number" && Number.isFinite(scalar) ? scalar : GENE_CATALOG[key].default,
        );
        alleles[key] = [fallback, fallback];
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
