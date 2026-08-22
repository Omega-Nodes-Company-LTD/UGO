import { describe, expect, it } from "vitest";
import { tastesFrom } from "./tastes.js";

describe("i gusti dal genoma (gruppo 10)", () => {
  it("senza genoma ogni arredo pesa 1: il corpo di prima, esattamente", () => {
    const tastes = tastesFrom(undefined);
    for (const weight of Object.values(tastes)) expect(weight).toBe(1);
  });

  it("l'ardito pesa la palla, il flemmatico il cuscino — e non sono lo stesso maiale", () => {
    const bold = tastesFrom({ boldness: 0.95, curiosity: 0.8, calm: 0.2 });
    const placid = tastesFrom({ boldness: 0.1, calm: 0.95, chonk: 0.9 });
    expect(bold.ball).toBeGreaterThan(1.2);
    expect(bold.cushion).toBeLessThan(1);
    expect(placid.cushion).toBeGreaterThan(1.2);
    expect(placid.ball).toBeLessThan(1);
    // il timido bazzica il cespuglio più dell'ardito
    expect(placid.bush).toBeGreaterThan(bold.bush);
  });

  it("il gusto inclina, non comanda: resta dentro [0.6, 1.5] anche a genoma estremo", () => {
    const extreme = tastesFrom({ boldness: 1, curiosity: 1, calm: 0, chonk: 1 });
    for (const weight of Object.values(extreme)) {
      expect(weight).toBeGreaterThanOrEqual(0.6);
      expect(weight).toBeLessThanOrEqual(1.5);
    }
  });

  it("un tratto mancante vale il neutro, non zero: mezzo genoma non fa mezzo maiale", () => {
    const half = tastesFrom({ boldness: 0.9 });
    expect(half.cushion).toBe(1);
    expect(half.grass).toBe(1);
    expect(half.ball).toBeGreaterThan(1);
  });
});
