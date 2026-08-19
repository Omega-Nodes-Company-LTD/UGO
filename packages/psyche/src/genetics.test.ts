import { describe, expect, it } from "vitest";
import {
  CEPPI,
  expressedTraits,
  founderGenome,
  GENE_CATALOG,
  GENE_KEYS,
  toTraitSet,
  type Genome,
} from "./genes.js";
import {
  canMate,
  COMPAT_MAX_DISTANCE,
  drawLitterSize,
  genomeDistance,
  mate,
  mulberry32,
  screen,
} from "./genetics.js";

/**
 * ADR-068: il motore genetico è puro — caso e tempo entrano come parametri,
 * quindi questi sono unit test legittimi (regola 1: funzioni pure).
 */

const founder = (traits: Partial<Record<(typeof GENE_KEYS)[number], number>>, ceppo = 0): Genome =>
  founderGenome(traits, ceppo);

describe("il fondatore: un trait_set di oggi diventa un genoma diploide", () => {
  it("è omozigote e esprime esattamente i valori scalari di partenza", () => {
    const g = founder({ chonk: 0.8, calm: 0.9, boldness: 0.3 });
    expect(g.alleles.chonk).toEqual([0.8, 0.8]);
    const expressed = expressedTraits(g);
    expect(expressed.chonk).toBeCloseTo(0.8, 10);
    expect(expressed.calm).toBeCloseTo(0.9, 10);
  });

  it("riempie i geni mancanti coi default del catalogo, come fa characterFrom", () => {
    const expressed = expressedTraits(founder({}));
    for (const key of GENE_KEYS) {
      expect(expressed[key]).toBeCloseTo(GENE_CATALOG[key].default, 10);
    }
  });
});

describe("l'espressione: dominanza, recessività, epistasi", () => {
  it("spots è recessivo: chiazze solo se ENTRAMBI gli alleli sono alti", () => {
    const het = founder({});
    het.alleles.spots = [0.9, 0.05];
    expect(expressedTraits(het).spots).toBeCloseTo(0.05, 10);
    const hom = founder({});
    hom.alleles.spots = [0.9, 0.85];
    expect(expressedTraits(hom).spots).toBeCloseTo(0.85, 10);
  });

  it("boldness domina: basta un allele sfacciato", () => {
    const g = founder({});
    g.alleles.boldness = [0.9, 0.1];
    expect(expressedTraits(g).boldness).toBeCloseTo(0.9, 10);
  });

  it("epistasi: il timido non è logorroico anche se porta il gene", () => {
    const g = founder({ talkativeness: 1 });
    g.alleles.boldness = [0.05, 0.1];
    expect(expressedTraits(g).talkativeness).toBeLessThanOrEqual(0.35);
  });
});

describe("la serializzazione: superset del jsonb che i lettori di oggi già capiscono", () => {
  it("porta i valori espressi, il ceppo e il genotipo", () => {
    const g = founder({ chonk: 0.7 }, 3);
    const row = toTraitSet(g);
    expect(row.chonk).toBeCloseTo(0.7, 10);
    expect(row.ceppo).toBe(3);
    expect(row.alleles).toEqual(g.alleles);
  });
});

describe("l'anello di compatibilità e i ceppi", () => {
  it("rifiuta un genitore solo", () => {
    expect(canMate([founder({})])).toMatchObject({ ok: false, reason: "servono-almeno-due-genitori" });
  });

  it("rifiuta ceppi uguali, anche nella poliparentale", () => {
    const a = founder({ calm: 0.9 }, 1);
    const b = founder({ calm: 0.2 }, 2);
    const c = founder({ boldness: 0.9 }, 1);
    expect(canMate([a, c])).toMatchObject({ ok: false, reason: "ceppi-uguali" });
    expect(canMate([a, b, c])).toMatchObject({ ok: false, reason: "ceppi-uguali" });
  });

  it("rifiuta due copie dello stesso genoma: troppo simili", () => {
    const a = founder({ calm: 0.9 }, 1);
    const clone = founder({ calm: 0.9 }, 2);
    expect(genomeDistance(a, clone)).toBeCloseTo(0, 10);
    expect(canMate([a, clone])).toMatchObject({ ok: false, reason: "troppo-simili" });
  });

  it("rifiuta genomi fuori specie: troppo diversi", () => {
    const zeros = Object.fromEntries(GENE_KEYS.map((k) => [k, 0]));
    const ones = Object.fromEntries(GENE_KEYS.map((k) => [k, 1]));
    const a = founder(zeros, 1);
    const b = founder(ones, 2);
    expect(genomeDistance(a, b)).toBeGreaterThan(COMPAT_MAX_DISTANCE);
    expect(canMate([a, b])).toMatchObject({ ok: false, reason: "troppo-diversi" });
  });

  it("la distanza è simmetrica e una coppia sana passa", () => {
    const a = founder({ calm: 0.9, curiosity: 0.3 }, 1);
    const b = founder({ calm: 0.4, curiosity: 0.7 }, 5);
    expect(genomeDistance(a, b)).toBeCloseTo(genomeDistance(b, a), 10);
    expect(canMate([a, b])).toEqual({ ok: true });
  });
});

describe("la cucciolata", () => {
  const mamma = founder({ calm: 0.9, curiosity: 0.2, spots: 0.9 }, 1);
  const babbo = founder({ calm: 0.3, curiosity: 0.8, boldness: 0.7 }, 4);

  it("stesso seme, stessa cucciolata: una nascita contestata si riproduce", () => {
    const una = mate([mamma, babbo], { rand: mulberry32(42), litterSize: 4 });
    const due = mate([mamma, babbo], { rand: mulberry32(42), litterSize: 4 });
    expect(una).toEqual(due);
    const tre = mate([mamma, babbo], { rand: mulberry32(7), litterSize: 4 });
    expect(una).not.toEqual(tre);
  });

  it("rifiuta di generare fuori dall'anello", () => {
    const clone = founder({ calm: 0.9, curiosity: 0.2, spots: 0.9 }, 2);
    expect(() => mate([mamma, clone], { rand: mulberry32(1) })).toThrow(/troppo-simili/);
  });

  it("senza mutazione ogni allele viene da un genitore, e il ceppo pure", () => {
    // rand costante 0.99: mai sotto i tassi di mutazione, scelte sempre "ultimo"
    const cubs = mate([mamma, babbo], { rand: () => 0.99, litterSize: 2 });
    for (const cub of cubs) {
      for (const key of GENE_KEYS) {
        for (const allele of cub.alleles[key]) {
          const fromAParent = [...mamma.alleles[key], ...babbo.alleles[key]].some(
            (v) => Math.abs(v - allele) < 1e-12,
          );
          expect(fromAParent).toBe(true);
        }
      }
      expect([mamma.ceppo, babbo.ceppo]).toContain(cub.ceppo);
    }
  });

  it("i ceppi dei cuccioli restano nel dominio, quasi sempre nei genitori", () => {
    const rand = mulberry32(2026);
    const cubs = mate([mamma, babbo], { rand, litterSize: 100 });
    let inherited = 0;
    for (const cub of cubs) {
      expect(cub.ceppo).toBeGreaterThanOrEqual(0);
      expect(cub.ceppo).toBeLessThan(CEPPI);
      if (cub.ceppo === mamma.ceppo || cub.ceppo === babbo.ceppo) inherited += 1;
    }
    expect(inherited).toBeGreaterThan(85);
  });

  it("la rarità recessiva emerge: da due portatori, chiazze in circa un quarto", () => {
    const portatriceA = founder({ calm: 0.8 }, 1);
    portatriceA.alleles.spots = [0.9, 0.05];
    const portatoreB = founder({ calm: 0.3, curiosity: 0.8 }, 4);
    portatoreB.alleles.spots = [0.9, 0.05];
    const cubs = mate([portatriceA, portatoreB], { rand: mulberry32(11), litterSize: 400 });
    const spotted = cubs.filter((cub) => expressedTraits(cub).spots >= 0.7).length / cubs.length;
    expect(spotted).toBeGreaterThan(0.15);
    expect(spotted).toBeLessThan(0.35);
  });

  it("la poliparentale pesa i genitori: chi pesa zero non lascia alleli", () => {
    const nonno = founder({ hue: 0.111 }, 6);
    nonno.alleles.hue = [0.111, 0.111];
    const cubs = mate([mamma, babbo, nonno], {
      rand: () => 0.4, // niente mutazione, pesca sempre dentro i primi due
      litterSize: 2,
      weights: [1, 1, 0],
    });
    for (const cub of cubs) {
      for (const allele of cub.alleles.hue) {
        expect(Math.abs(allele - 0.111)).toBeGreaterThan(1e-9);
      }
    }
  });
});

describe("lo screening: filtra i rotti, non sceglie i migliori", () => {
  it("un fondatore qualunque è vitale", () => {
    expect(screen(founder({ calm: 0.9 }))).toEqual({ viable: true });
  });

  it("boccia la struttura rotta: NaN o alleli fuori scala", () => {
    const g = founder({});
    g.alleles.chonk = [Number.NaN, 0.5];
    const verdict = screen(g);
    expect(verdict.viable).toBe(false);
    if (!verdict.viable) expect(verdict.reasons.join(" ")).toMatch(/struttura/);
  });

  it("boccia lo spento: un compagno che ignora il mondo è rotto", () => {
    const g = founder({ curiosity: 0.05, affection: 0.05, talkativeness: 0.05 });
    const verdict = screen(g);
    expect(verdict.viable).toBe(false);
    if (!verdict.viable) expect(verdict.reasons.join(" ")).toMatch(/spento/);
  });

  it("boccia il sovraeccitato: stress inchiodato senza tregua", () => {
    const g = founder({ calm: 0.02, curiosity: 0.98, boldness: 0.98 });
    const verdict = screen(g);
    expect(verdict.viable).toBe(false);
    if (!verdict.viable) expect(verdict.reasons.join(" ")).toMatch(/sovraeccitato/);
  });
});

describe("drawLitterSize (ADR-103)", () => {
  /**
   * La taglia non si sceglie: si tira. Questo test guarda la **forma** della
   * distribuzione su un campione grande — non un caso singolo, che di un dado
   * non dice niente.
   */
  it("sta fra 1 e 10, e vive quasi sempre fra 2 e 8", () => {
    const rand = mulberry32(20260819);
    const sizes = Array.from({ length: 20_000 }, () => drawLitterSize(rand));
    expect(Math.min(...sizes)).toBe(1);
    expect(Math.max(...sizes)).toBe(10);
    const rare = sizes.filter((n) => n === 1 || n === 10).length;
    // le code sono rare per davvero: attese ~4%, e questo test fallirebbe sia
    // se sparissero sia se diventassero un caso comune
    expect(rare / sizes.length).toBeGreaterThan(0.02);
    expect(rare / sizes.length).toBeLessThan(0.07);
    // e ogni taglia dell'intervallo normale esce
    for (const n of [2, 3, 4, 5, 6, 7, 8]) expect(sizes).toContain(n);
  });

  it("dallo stesso seme esce la stessa cucciolata, taglia compresa", () => {
    const first = Array.from({ length: 5 }, (_, i) => drawLitterSize(mulberry32(1000 + i)));
    const again = Array.from({ length: 5 }, (_, i) => drawLitterSize(mulberry32(1000 + i)));
    expect(again).toEqual(first);
  });
});
