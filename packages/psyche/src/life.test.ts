import { describe, expect, it } from "vitest";
import { founderGenome } from "./genes.js";
import {
  CUB_UNTIL,
  ELDER_FROM,
  LIFESPAN_MAX_DAYS,
  LIFESPAN_MIN_DAYS,
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

describe("il gene della longevità", () => {
  it("mappa sulla scala del criceto e non oltre", () => {
    expect(lifespanDaysFor(0)).toBe(LIFESPAN_MIN_DAYS);
    expect(lifespanDaysFor(1)).toBe(LIFESPAN_MAX_DAYS);
    expect(lifespanDaysFor(0.5)).toBeGreaterThan(LIFESPAN_MIN_DAYS);
    expect(lifespanDaysFor(0.5)).toBeLessThan(LIFESPAN_MAX_DAYS);
  });

  it("regge valori fuori scala senza inventarsi vite eterne", () => {
    expect(lifespanDaysFor(-3)).toBe(LIFESPAN_MIN_DAYS);
    expect(lifespanDaysFor(9)).toBe(LIFESPAN_MAX_DAYS);
  });

  it("un fondatore qualunque vive nella media: nessuna migrazione, nessuna sorpresa", () => {
    const life = lifeOf(founderGenome({}), BORN, after(10));
    expect(life.lifespanDays).toBe(lifespanDaysFor(0.5));
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
    expect(worst).toBeLessThan(0.005);
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
