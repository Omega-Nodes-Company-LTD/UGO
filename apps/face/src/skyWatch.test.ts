import { describe, expect, it } from "vitest";
import { skyStateFrom } from "./skyWatch.js";

/**
 * La risposta di soul diventa lo stato del cielo. La parte pura del giro:
 * il fetch e il timer sono browser, la decisione è qui e si prova in Node.
 */

const NIGHT = new Date("2026-08-16T21:30:00Z");

describe("skyStateFrom", () => {
  it("di giorno: la tavolozza dal meteo, niente astri", () => {
    const state = skyStateFrom({ available: true, kind: "rain", isDay: true }, NIGHT);
    expect(state).toEqual({ mode: "day", weather: "rain" });
  });

  it("di notte a cielo sereno arrivano la luna con la fase e i pianeti", () => {
    const state = skyStateFrom(
      { available: true, kind: "clear", isDay: false, lat: 41.9, lon: 12.5 },
      NIGHT,
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
