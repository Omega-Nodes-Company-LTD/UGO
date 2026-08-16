import { describe, expect, it } from "vitest";
import { skyStateFrom } from "./skyWatch.js";

/**
 * La risposta di soul diventa lo stato del cielo. La parte pura del giro:
 * il fetch e il timer sono browser, la decisione è qui e si prova in Node.
 */

const NIGHT = new Date("2026-08-16T21:30:00Z");

describe("skyStateFrom", () => {
  it("di giorno: la tavolozza dal meteo, niente astri", () => {
    // mezzogiorno di Roma: il sole calcolato dice giorno
    const noon = new Date("2026-08-16T11:00:00Z");
    const state = skyStateFrom(
      { available: true, kind: "rain", isDay: true, lat: 41.9, lon: 12.5 },
      noon,
    );
    expect(state).toEqual({ mode: "day", weather: "rain" });
    // senza coordinate si ripiega su is_day: niente ora d'oro, ma mai il buio
    // a mezzogiorno
    expect(skyStateFrom({ available: true, kind: "rain", isDay: true }, noon)).toEqual({
      mode: "day",
      weather: "rain",
    });
  });

  it("al crepuscolo il cielo è d'oro, agli orari veri: lo trova il sole calcolato", () => {
    // si scandisce la sera fino a trovare il sole fra -6° e +6°: l'ora d'oro
    // esiste ogni giorno, e dev'essere il modo che ne esce
    let golden: Date | undefined;
    for (let m = 16 * 60; m < 24 * 60; m += 5) {
      const at = new Date(Date.UTC(2026, 7, 16, 0, m));
      const state = skyStateFrom(
        { available: true, kind: "clear", isDay: true, lat: 41.9, lon: 12.5 },
        at,
      );
      if (state?.mode === "golden") {
        golden = at;
        break;
      }
    }
    expect(golden).toBeDefined();
  });

  it("di notte a cielo sereno arrivano la luna con la fase e i pianeti", () => {
    const state = skyStateFrom(
      { available: true, kind: "clear", isDay: false, lat: 41.9, lon: 12.5 },
      // mezzanotte e mezza di Roma: il sole calcolato dice notte fonda
      new Date("2026-08-16T22:30:00Z"),
    );
    expect(state?.mode).toBe("night");
    expect(state?.night).toBeDefined();
    const moon = state?.night?.moon;
    expect(moon?.fraction).toBeGreaterThanOrEqual(0);
    expect(moon?.fraction).toBeLessThanOrEqual(1);
    // i pianeti sono quelli sopra l'orizzonte: lista possibilmente vuota, mai assente
    expect(Array.isArray(state?.night?.planets)).toBe(true);
  });

  it("senza meteo il cielo resta quello di prima: undefined, non un default", () => {
    expect(skyStateFrom({ available: false }, NIGHT)).toBeUndefined();
    expect(skyStateFrom(undefined, NIGHT)).toBeUndefined();
  });
});
