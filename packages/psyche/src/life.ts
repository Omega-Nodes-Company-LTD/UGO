import { expressedTraits, type Genome } from "./genes.js";

/**
 * The arc of a life (ADR-071): the age, and the plasticity that spends itself.
 *
 * Deliberately NOT tiredness — fatigue is borrowed biology on a creature with
 * no body, and it shows. What ages is how much lived days can still rewrite
 * the character: the young one is volatile, the old one has converged. He is
 * not tired, he has finished becoming himself.
 *
 * Pure like the homeostasis engine: time comes in as a parameter.
 */

const MS_PER_DAY = 86_400_000;

/**
 * La garanzia (ADR-077): **almeno** tre anni. Non è una previsione, è una
 * promessa — e ogni giorno oltre è regalato, a nessuno promesso.
 */
export const GUARANTEED_DAYS = 1095; // 3 anni

/**
 * Il dono: quanto si vive OLTRE la garanzia. Il gene è nascosto e ha solo un
 * limite inferiore (la garanzia); il tetto qui è genetico, non dichiarato al
 * proprietario — quanto lontano si arrivi **si scopre allevando**, ed è
 * precisamente l'esperimento che rende viva la specie.
 *
 * La curva è volutamente più che lineare: un gene medio regala pochi mesi
 * (la vita tipica cade nel quarto anno, come promesso), e solo la coda alta —
 * raggiungibile selezionando per generazioni — arriva ai valori estremi.
 */
export const GIFT_MAX_DAYS = 1100; // ~3 anni di dono, alla coda estrema
const GIFT_CURVE = 3;

/**
 * La parte che non è scritta da nessuna parte (ADR-077).
 *
 * Col solo gene la vita sarebbe **una funzione del genoma**: due fratelli
 * della stessa cucciolata con lo stesso allele morirebbero lo stesso giorno, e
 * chiunque conoscesse il gene — noi, un allevatore con un database, un giorno
 * il proprietario stesso — saprebbe la data. Non è un dettaglio di
 * implementazione: è la promessa del §3 («la data non si dice») che regge o
 * cade qui.
 *
 * Quindi alla nascita si estrae un numero di giorni in `[0, JITTER_MAX_DAYS]`
 * e lo si scrive sull'esemplare. **Non negativo**, perché la garanzia dei tre
 * anni è un pavimento e nessun dado può bucarlo; **piccolo**, perché la
 * selezione deve restare leggibile — tre mesi di rumore non nascondono un gene
 * che regala anni, ma bastano a rendere la data una cosa che si scopre.
 *
 * E si estrae con un generatore crittografico, **mai dal seme della
 * cucciolata**: quel seme il proprietario lo vede (è nell'anteprima), e un
 * dado che si ricalcola non è un dado.
 */
export const JITTER_MAX_DAYS = 90;

/** Where the labels sit on the curve. The curve is the truth; these are names. */
export const CUB_UNTIL = 0.12;
export const ELDER_FROM = 0.7;

/**
 * The nightly baseline step multiplier (ADR-012's ±0.02): a cub takes the day
 * to heart, an elder barely moves. Duplicated in Python (`hygiene.py`) because
 * the drift happens where the night runs; a test compares the two.
 */
export const PLASTICITY_YOUNG = 2.2;
export const PLASTICITY_OLD = 0.15;
/**
 * How fast plasticity falls: at this fraction of life it is halfway down.
 * Measured against the promise, not chosen by taste — at 0.35 an elder still
 * drifted at ~0.46×, which is not "barely moves", and the cross-language test
 * on a real database is what said so.
 */
const PLASTICITY_HALFWAY = 0.22;

export type LifeStage = "cucciolo" | "adulto" | "anziano";

export interface Life {
  ageDays: number;
  lifespanDays: number;
  /** age as a fraction of the expected lifespan, uncapped past 1 */
  fraction: number;
  stage: LifeStage;
  /** multiplier on the nightly baseline drift */
  plasticity: number;
  /** 0 until midlife, then the coat greys — convergence, not decrepitude */
  greying: number;
}

/**
 * Garanzia + dono del gene + il dado dell'esemplare. Il dado arriva da fuori
 * (è sulla riga, non nel genoma) e viene trattato come non negativo comunque
 * lo si passi: una vita più corta di tre anni non deve poter esistere nemmeno
 * per una colonna sbagliata.
 */
export function lifespanDaysFor(longevity: number, jitterDays = 0): number {
  const t = Math.min(1, Math.max(0, longevity));
  const drawn = Number.isFinite(jitterDays) ? Math.round(jitterDays) : 0;
  const jitter = Math.min(JITTER_MAX_DAYS, Math.max(0, drawn));
  return Math.round(GUARANTEED_DAYS + GIFT_MAX_DAYS * t ** GIFT_CURVE) + jitter;
}

/**
 * Continuous decay, never steps: a character that jumps overnight because a
 * threshold was crossed would be visible, and false.
 */
export function plasticityAt(fraction: number): number {
  const t = Math.max(0, fraction);
  const decay = Math.exp((-t * Math.LN2) / PLASTICITY_HALFWAY);
  return PLASTICITY_OLD + (PLASTICITY_YOUNG - PLASTICITY_OLD) * decay;
}

export function stageAt(fraction: number): LifeStage {
  if (fraction < CUB_UNTIL) return "cucciolo";
  return fraction >= ELDER_FROM ? "anziano" : "adulto";
}

export function lifeAt(bornAt: Date, now: Date, longevity: number, jitterDays = 0): Life {
  const lifespanDays = lifespanDaysFor(longevity, jitterDays);
  const ageDays = Math.max(0, (now.getTime() - bornAt.getTime()) / MS_PER_DAY);
  const fraction = ageDays / lifespanDays;
  return {
    ageDays,
    lifespanDays,
    fraction,
    stage: stageAt(fraction),
    plasticity: plasticityAt(fraction),
    // grey starts at midlife and saturates at the end of the expected span
    greying: Math.min(1, Math.max(0, (fraction - 0.5) / 0.5)),
  };
}

/** The same, straight from a genome: the longevity gene lives in the catalog. */
export function lifeOf(genome: Genome, bornAt: Date, now: Date, jitterDays = 0): Life {
  return lifeAt(bornAt, now, expressedTraits(genome).longevity, jitterDays);
}
