import {
  CEPPI,
  expressedTraits,
  GENE_KEYS,
  type Allele,
  type GeneKey,
  type Genome,
} from "./genes.js";

/**
 * Recombination, the compatibility ring and the health screen (ADR-068).
 *
 * Pure like the rest of the engine: randomness is injected (`rand`), never
 * drawn from the environment, so a contested birth can be replayed from its
 * seed. The screen filters what is broken and ranks nothing — selection
 * belongs to the breeder, not to a server (VISIONE, orizzonte 1).
 */

/** The ring (ADR-068 §4): closer is inbreeding, farther is another species. */
export const COMPAT_MIN_DISTANCE = 0.04;
export const COMPAT_MAX_DISTANCE = 0.55;

/** Mutation rates — to be re-measured against a real population, here only. */
export const ALLELE_MUTATION_RATE = 0.08;
export const ALLELE_MUTATION_SPAN = 0.06;
export const CEPPO_MUTATION_RATE = 0.05;

const DEFAULT_LITTER_SIZE = 3;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Mean absolute difference of expressed values: the creature you would meet. */
export function genomeDistance(a: Genome, b: Genome): number {
  const ta = expressedTraits(a);
  const tb = expressedTraits(b);
  let total = 0;
  for (const key of GENE_KEYS) {
    total += Math.abs(ta[key] - tb[key]);
  }
  return total / GENE_KEYS.length;
}

export type MateRefusalReason =
  | "servono-almeno-due-genitori"
  | "ceppi-uguali"
  | "troppo-simili"
  | "troppo-diversi";

export type MateVerdict = { ok: true } | { ok: false; reason: MateRefusalReason };

/** Every pair must hold: distinct ceppi, and a distance inside the ring. */
export function canMate(parents: readonly Genome[]): MateVerdict {
  if (parents.length < 2) return { ok: false, reason: "servono-almeno-due-genitori" };
  for (const [i, a] of parents.entries()) {
    for (const b of parents.slice(i + 1)) {
      if (a.ceppo === b.ceppo) return { ok: false, reason: "ceppi-uguali" };
      const distance = genomeDistance(a, b);
      if (distance < COMPAT_MIN_DISTANCE) return { ok: false, reason: "troppo-simili" };
      if (distance > COMPAT_MAX_DISTANCE) return { ok: false, reason: "troppo-diversi" };
    }
  }
  return { ok: true };
}

export interface LitterOptions {
  /** injected randomness in [0,1): pass mulberry32(seed) for reproducibility */
  rand: () => number;
  litterSize?: number;
  /** polyparental contribution weights, one per parent; equal when omitted */
  weights?: readonly number[];
}

interface DrawTableRow {
  /** cumulative upper edge in (0,1]: a draw below it lands on this parent */
  edge: number;
  parent: Genome;
}

function drawTable(parents: readonly Genome[], weights?: readonly number[]): DrawTableRow[] {
  const raw = weights ?? parents.map(() => 1);
  if (raw.length !== parents.length) throw new Error("un peso per genitore");
  if (raw.some((w) => w < 0 || !Number.isFinite(w))) throw new Error("pesi non negativi");
  const total = raw.reduce((sum, w) => sum + w, 0);
  if (total <= 0) throw new Error("almeno un peso positivo");
  const table: DrawTableRow[] = [];
  let running = 0;
  for (const [i, parent] of parents.entries()) {
    running += (raw[i] ?? 0) / total;
    table.push({ edge: running, parent });
  }
  return table;
}

function pickParent(table: readonly DrawTableRow[], rand: () => number): Genome {
  const draw = rand();
  let fallback: Genome | undefined;
  for (const row of table) {
    fallback = row.parent;
    if (draw < row.edge) return row.parent;
  }
  // floating point can leave the last edge a hair under 1: land on the last row
  if (fallback === undefined) throw new Error("nessun genitore nel tavolo dei pesi");
  return fallback;
}

/** One allele: a weighted parent, one of their two alleles, a rare jitter. */
function drawAllele(table: readonly DrawTableRow[], key: GeneKey, rand: () => number): number {
  const pair = pickParent(table, rand).alleles[key];
  let value = rand() < 0.5 ? pair[0] : pair[1];
  if (rand() < ALLELE_MUTATION_RATE) {
    value = clamp01(value + (rand() * 2 - 1) * ALLELE_MUTATION_SPAN);
  }
  return value;
}

/**
 * The litter (ADR-068 §5). With two parents this is classic meiosis; with more
 * it is the polyparental litter of the sagra — each allele drawn independently.
 * Throws with the refusal reason when the parents cannot mate: callers meaning
 * to explain a refusal gently should ask `canMate` first.
 */
export function mate(parents: readonly Genome[], options: LitterOptions): Genome[] {
  const verdict = canMate(parents);
  if (!verdict.ok) throw new Error(`cucciolata rifiutata: ${verdict.reason}`);
  const { rand } = options;
  const litterSize = options.litterSize ?? DEFAULT_LITTER_SIZE;
  const table = drawTable(parents, options.weights);

  const litter: Genome[] = [];
  for (let cub = 0; cub < litterSize; cub += 1) {
    const alleles = {} as Record<GeneKey, Allele>;
    for (const key of GENE_KEYS) {
      alleles[key] = [drawAllele(table, key, rand), drawAllele(table, key, rand)];
    }
    let ceppo = pickParent(table, rand).ceppo;
    if (rand() < CEPPO_MUTATION_RATE) {
      ceppo = Math.floor(rand() * CEPPI);
    }
    litter.push({ ceppo, alleles });
  }
  return litter;
}

export type ScreenVerdict = { viable: true } | { viable: false; reasons: string[] };

/**
 * The health screen (ADR-068 §6): binary, flat-cost, no scores. It rejects
 * broken structure and the two declared degeneracies — nothing else.
 */
export function screen(genome: Genome): ScreenVerdict {
  const reasons: string[] = [];

  const structureOk =
    Number.isInteger(genome.ceppo) &&
    genome.ceppo >= 0 &&
    genome.ceppo < CEPPI &&
    GENE_KEYS.every((key) => {
      // jsonb may hand us anything: the type says tuple, the runtime must check
      const pair: unknown = (genome.alleles as Record<string, unknown>)[key];
      return (
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)
      );
    });
  if (!structureOk) {
    return { viable: false, reasons: ["struttura del genoma non valida"] };
  }

  const t = expressedTraits(genome);
  if (t.curiosity <= 0.1 && t.affection <= 0.1 && t.talkativeness <= 0.1) {
    reasons.push("spento: ignora il mondo, non è introversione");
  }
  if (t.calm <= 0.05 && t.curiosity >= 0.95 && t.boldness >= 0.95) {
    reasons.push("sovraeccitato: stress di riposo inchiodato senza tregua");
  }

  return reasons.length === 0 ? { viable: true } : { viable: false, reasons };
}

/** Tiny seeded PRNG (mulberry32): good enough for litters, trivial to replay. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
