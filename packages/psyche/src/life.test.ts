import { describe, expect, it } from "vitest";
import { founderGenome } from "./genes.js";
import {
  CUB_UNTIL,
  ELDER_FROM,
  GIFT_MAX_DAYS,
  GUARANTEED_DAYS,
  JITTER_MAX_DAYS,
  lifeAt,
  lifeOf,
  lifespanDaysFor,
  PLASTICITY_OLD,
  PLASTICITY_YOUNG,
  plasticityAt,
  stageAt,
} from "./life.js";

/** ADR-071: puro come il motore d'omeostasi — il tempo entra come parametro. */

const BORN = new Date("2026-01-01T00:00:00.000Z");
const after = (days: number): Date => new Date(BORN.getTime() + days * 86_400_000);

describe("il gene della longevità (nascosto, ADR-077)", () => {
  it("la garanzia è un pavimento: NESSUN genoma vive meno di tre anni", () => {
    expect(lifespanDaysFor(0)).toBe(GUARANTEED_DAYS);
    for (const gene of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      expect(lifespanDaysFor(gene)).toBeGreaterThanOrEqual(GUARANTEED_DAYS);
    }
  });

  it("il gene medio regala pochi mesi: la vita tipica cade nel quarto anno", () => {
    const tipica = lifespanDaysFor(0.5);
    expect(tipica).toBeGreaterThan(GUARANTEED_DAYS);
    expect(tipica).toBeLessThan(GUARANTEED_DAYS + 365);
  });

  it("la coda alta esiste ed è lontana: è lì che va la selezione", () => {
    expect(lifespanDaysFor(1)).toBe(GUARANTEED_DAYS + GIFT_MAX_DAYS);
    // il confronto è sul DONO, non sul totale: col pavimento di tre anni i
    // totali si somigliano sempre, ed è appunto la garanzia che li avvicina
    const dono = (gene: number): number => lifespanDaysFor(gene) - GUARANTEED_DAYS;
    // metà gene non dà metà dono: la coda si conquista, non si incontra
    expect(dono(0.5)).toBeLessThan(dono(1) * 0.2);
    expect(dono(0.9)).toBeLessThan(dono(1) * 0.75);
  });

  it("regge valori fuori scala senza inventarsi vite eterne", () => {
    expect(lifespanDaysFor(-3)).toBe(GUARANTEED_DAYS);
    expect(lifespanDaysFor(9)).toBe(GUARANTEED_DAYS + GIFT_MAX_DAYS);
  });

  it("un fondatore qualunque vive nella media: nessuna migrazione, nessuna sorpresa", () => {
    const life = lifeOf(founderGenome({}), BORN, after(10));
    expect(life.lifespanDays).toBe(lifespanDaysFor(0.5));
  });
});

describe("il dado dell'esemplare (ADR-077): la data non è una funzione del genoma", () => {
  it("due fratelli con lo stesso gene NON hanno la stessa vita attesa", () => {
    // è il punto intero: col solo gene, la data della morte si calcolava
    expect(lifespanDaysFor(0.5, 7)).not.toBe(lifespanDaysFor(0.5, 61));
  });

  it("il dado somma giorni, uno per uno, e non fa altro", () => {
    for (const jitter of [0, 1, 30, 89, JITTER_MAX_DAYS]) {
      expect(lifespanDaysFor(0.5, jitter)).toBe(lifespanDaysFor(0.5) + jitter);
    }
  });

  it("nessun dado buca il pavimento: la garanzia vale anche con una colonna sbagliata", () => {
    expect(lifespanDaysFor(0, -400)).toBe(GUARANTEED_DAYS);
    expect(lifespanDaysFor(0, Number.NaN)).toBe(GUARANTEED_DAYS);
  });

  it("nessun dado sposta la selezione: il rumore è mesi, il gene è anni", () => {
    // il dado più fortunato su un gene mediocre non raggiunge un gene selezionato
    expect(lifespanDaysFor(0.5, JITTER_MAX_DAYS)).toBeLessThan(lifespanDaysFor(0.9));
  });

  it("l'arco intero lo sente: col dado si ingrigisce un po' più tardi", () => {
    const day = after(1200);
    expect(lifeAt(BORN, day, 0.5, JITTER_MAX_DAYS).greying).toBeLessThan(
      lifeAt(BORN, day, 0.5).greying,
    );
  });
});

describe("la plasticità che si consuma", () => {
  it("il cucciolo assorbe tutto, l'anziano quasi niente", () => {
    expect(plasticityAt(0)).toBeCloseTo(PLASTICITY_YOUNG, 5);
    expect(plasticityAt(2)).toBeGreaterThan(PLASTICITY_OLD);
    expect(plasticityAt(2)).toBeLessThan(0.3);
  });

  it("scende sempre: la curva è monotona su tutta la vita", () => {
    let previous = plasticityAt(0);
    for (let f = 0.02; f <= 1.2; f += 0.02) {
      const now = plasticityAt(f);
      expect(now).toBeLessThan(previous);
      previous = now;
    }
  });

  it("in una notte non salta: è il punto per cui la curva è continua", () => {
    // un giorno su una vita media, che è l'intervallo vero — non un mese
    const oneDay = 1 / lifespanDaysFor(0.5);
    let worst = 0;
    for (let f = 0; f <= 1.2; f += oneDay) {
      worst = Math.max(worst, plasticityAt(f) - plasticityAt(f + oneDay));
    }
    // «non salta» vuol dire: meno dell'1% dell'intera escursione (2,2 → 0,15)
    // in un giorno. La soglia è relativa al senso, non alla vita di un genoma.
    expect(worst).toBeLessThan((PLASTICITY_YOUNG - PLASTICITY_OLD) * 0.01);
  });

  it("non scende mai sotto il pavimento: un vecchio impara poco, non zero", () => {
    expect(plasticityAt(50)).toBeGreaterThanOrEqual(PLASTICITY_OLD);
  });
});

describe("le età sono un'etichetta per gli umani", () => {
  it("cucciolo, adulto, anziano cadono dove dice l'ADR", () => {
    expect(stageAt(0)).toBe("cucciolo");
    expect(stageAt(CUB_UNTIL - 0.001)).toBe("cucciolo");
    expect(stageAt(CUB_UNTIL)).toBe("adulto");
    expect(stageAt(ELDER_FROM - 0.001)).toBe("adulto");
    expect(stageAt(ELDER_FROM)).toBe("anziano");
    expect(stageAt(3)).toBe("anziano");
  });
});

describe("l'arco intero", () => {
  it("appena nato: cucciolo, plasticissimo, nessun grigio", () => {
    const life = lifeAt(BORN, after(1), 0.5);
    expect(life.stage).toBe("cucciolo");
    expect(life.ageDays).toBeCloseTo(1, 5);
    expect(life.plasticity).toBeGreaterThan(2);
    expect(life.greying).toBe(0);
  });

  it("a metà vita comincia a ingrigire, e non prima", () => {
    const span = lifespanDaysFor(0.5);
    expect(lifeAt(BORN, after(span * 0.49), 0.5).greying).toBe(0);
    expect(lifeAt(BORN, after(span * 0.75), 0.5).greying).toBeCloseTo(0.5, 1);
    expect(lifeAt(BORN, after(span), 0.5).greying).toBe(1);
  });

  it("oltre la vita attesa non esplode: il grigio è al massimo, la plasticità al minimo", () => {
    const life = lifeAt(BORN, after(lifespanDaysFor(0.5) * 3), 0.5);
    expect(life.greying).toBe(1);
    expect(life.stage).toBe("anziano");
    expect(life.plasticity).toBeGreaterThanOrEqual(PLASTICITY_OLD);
  });

  it("una data di nascita nel futuro non produce età negative", () => {
    const life = lifeAt(after(10), BORN, 0.5);
    expect(life.ageDays).toBe(0);
    expect(life.stage).toBe("cucciolo");
  });

  it("un longevo e uno effimero non hanno la stessa età alla stessa data", () => {
    const day = after(500);
    const effimero = lifeAt(BORN, day, 0);
    const longevo = lifeAt(BORN, day, 1);
    expect(effimero.fraction).toBeGreaterThan(longevo.fraction);
    expect(effimero.plasticity).toBeLessThan(longevo.plasticity);
  });
});
