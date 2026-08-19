import { GENE_CATALOG, GENE_KEYS, type GeneKey } from "@ugo/psyche";
import { describe, expect, it } from "vitest";
import { genomeFromStoredTraits } from "./genetics.js";

/**
 * ADR-109 — un gene nuovo non deve azzerare i pedigree.
 *
 * `trait_sets.traits` è jsonb scritto il giorno in cui la creatura è nata, e i
 * geni del catalogo cambiano: ADR-068 ne ha aggiunti due (`spots`, `tail`),
 * ADR-071 uno (`longevity`), e ogni volta che se ne aggiunge un altro **tutti i
 * genomi già scritti restano indietro di un locus**.
 *
 * Il lettore accettava la mappa degli alleli solo se c'erano TUTTI. Un locus in
 * meno la faceva buttare intera, e il genoma veniva ricostruito omozigote dai
 * valori **espressi** — cioè da quello che si vede addosso. Un allele portato e
 * non mostrato (lo `spots` recessivo, che è precisamente la rarità che ADR-068
 * voleva far emergere) spariva in silenzio, e alla prima riscrittura la perdita
 * diventava definitiva.
 */

const genomeUuid = "11111111-2222-3333-4444-555555555555";

/**
 * Una mappa completa di alleli, meno i loci che si vogliono far mancare.
 *
 * `bristle` è il caso vero e non un esempio: è il gene aggiunto da questa
 * stessa ADR, quindi ogni genoma scritto prima di oggi ha esattamente questa
 * forma — tutti i loci tranne quello.
 */
const storedAlleles = (
  over: Partial<Record<GeneKey, [number, number]>> = {},
  without: readonly GeneKey[] = [],
): Record<string, unknown> => {
  const alleles: Record<string, unknown> = {};
  for (const key of GENE_KEYS) {
    if (without.includes(key)) continue;
    const value = over[key] ?? [GENE_CATALOG[key].default, GENE_CATALOG[key].default];
    alleles[key] = value;
  }
  return alleles;
};

describe("genomeFromStoredTraits: il locus che manca non è un genoma da buttare", () => {
  it("tiene l'eterozigosi degli altri geni quando un locus non c'è", () => {
    const alleles = storedAlleles({ spots: [0.1, 0.9] }, ["bristle"]);

    const genome = genomeFromStoredTraits({ ceppo: 3, alleles }, genomeUuid);

    expect(genome.alleles.spots, "l'allele portato deve sopravvivere").toEqual([0.1, 0.9]);
    expect(genome.ceppo).toBe(3);
  });

  it("riempie il locus mancante dal catalogo, omozigote", () => {
    const genome = genomeFromStoredTraits(
      { ceppo: 0, alleles: storedAlleles({}, ["bristle"]) },
      genomeUuid,
    );
    const filled = GENE_CATALOG.bristle.default;
    expect(genome.alleles.bristle).toEqual([filled, filled]);
  });

  /**
   * E se il valore espresso c'era, si preferisce quello al catalogo: una
   * creatura che il pannello mostrava in un certo modo non deve cambiare
   * aspetto perché è stato aggiunto un gene altrove.
   */
  it("per il locus mancante preferisce il valore espresso, se c'era", () => {
    const genome = genomeFromStoredTraits(
      { ceppo: 0, alleles: storedAlleles({}, ["bristle"]), bristle: 0.9 },
      genomeUuid,
    );
    expect(genome.alleles.bristle).toEqual([0.9, 0.9]);
  });

  /**
   * Un locus **rotto** non è un locus mancante: se c'è ed è spazzatura, il dato
   * è inaffidabile e si riparte dal catalogo per quel gene soltanto — senza
   * portarsi dietro il resto della mappa, che non ha colpe.
   */
  it("un allele malformato vale come mancante, e non contagia gli altri", () => {
    const alleles = storedAlleles({ spots: [0.1, 0.9] });
    alleles.tail = "molto arricciata";

    const genome = genomeFromStoredTraits({ ceppo: 0, alleles }, genomeUuid);
    expect(genome.alleles.spots).toEqual([0.1, 0.9]);
    expect(genome.alleles.tail).toEqual([GENE_CATALOG.tail.default, GENE_CATALOG.tail.default]);
  });

  /**
   * La strada vecchia resta: un trait set scritto PRIMA di ADR-068 non ha
   * `alleles` affatto, e va letto dagli scalari espressi come si è sempre
   * fatto. Qui la ricostruzione omozigote è giusta, perché non c'è nessun
   * genotipo da perdere.
   */
  it("senza alcuna mappa di alleli legge gli scalari, come prima", () => {
    const genome = genomeFromStoredTraits({ chonk: 0.9, spots: 0.8 }, genomeUuid);
    expect(genome.alleles.chonk).toEqual([0.9, 0.9]);
    expect(genome.alleles.spots).toEqual([0.8, 0.8]);
  });
});
