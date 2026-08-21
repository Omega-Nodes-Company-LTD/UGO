import { describe, expect, it } from "vitest";
import { moonPhase, moonPosition, sunAltitude, visiblePlanets } from "./ephemeris.js";

/**
 * Il cielo di stanotte, provato contro il cielo di ieri.
 *
 * La fase della luna si verifica su date VERE — la luna nuova del 6 gennaio
 * 2000 e la piena del 21 gennaio 2000 (quella dell'eclissi) — perché sono le
 * uniche verità astronomiche che un test può portarsi dietro senza scaricare
 * niente. Per le posizioni si provano le proprietà fisiche (quote sensate,
 * sorgere e tramontare, determinismo): l'algoritmo è a bassa precisione
 * dichiarata (~1°), e la verifica fine si fa col cielo vero sopra il chiosco.
 */

const ROME = { lat: 41.9, lon: 12.5 };

describe("la fase della luna", () => {
  it("il 6 gennaio 2000 era nuova, il 21 era piena (l'eclissi)", () => {
    const newMoon = moonPhase(new Date("2000-01-06T18:14:00Z"));
    expect(newMoon.fraction).toBeLessThan(0.05);
    const fullMoon = moonPhase(new Date("2000-01-21T04:40:00Z"));
    expect(fullMoon.fraction).toBeGreaterThan(0.95);
  });

  it("fra la nuova e la piena cresce, dopo la piena cala", () => {
    expect(moonPhase(new Date("2000-01-14T00:00:00Z")).waxing).toBe(true);
    expect(moonPhase(new Date("2000-01-28T00:00:00Z")).waxing).toBe(false);
  });
});

describe("le posizioni (bassa precisione, proprietà fisiche)", () => {
  it("quote e azimut restano nei loro intervalli, e il calcolo è deterministico", () => {
    const at = new Date("2026-08-16T21:00:00Z");
    const first = visiblePlanets(at, ROME.lat, ROME.lon);
    const second = visiblePlanets(at, ROME.lat, ROME.lon);
    expect(second).toEqual(first);
    for (const body of first) {
      expect(body.altitude).toBeGreaterThan(3);
      expect(body.altitude).toBeLessThanOrEqual(90);
      expect(body.azimuth).toBeGreaterThanOrEqual(0);
      expect(body.azimuth).toBeLessThan(360);
    }
    const moon = moonPosition(at, ROME.lat, ROME.lon);
    expect(Math.abs(moon.altitude)).toBeLessThanOrEqual(90);
  });

  it("in ventiquattro ore la luna sorge e tramonta: il cielo gira davvero", () => {
    // se il tempo siderale fosse rotto, la quota resterebbe inchiodata: questo
    // è il test che prende l'errore da cui l'algoritmo è già passato una volta
    const altitudes: number[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(Date.UTC(2026, 7, 16, hour));
      altitudes.push(moonPosition(at, ROME.lat, ROME.lon).altitude);
    }
    expect(Math.max(...altitudes)).toBeGreaterThan(10);
    expect(Math.min(...altitudes)).toBeLessThan(-10);
  });

  it("il sole: alto a mezzogiorno d'agosto, sotto l'orizzonte a mezzanotte", () => {
    // Roma, 16 agosto: a mezzogiorno solare il sole sta oltre i 50°, a
    // mezzanotte ben sotto — e fra i due DEVE attraversare l'ora d'oro
    expect(sunAltitude(new Date("2026-08-16T11:00:00Z"), ROME.lat, ROME.lon)).toBeGreaterThan(50);
    expect(sunAltitude(new Date("2026-08-16T23:00:00Z"), ROME.lat, ROME.lon)).toBeLessThan(-20);
    let golden = 0;
    for (let m = 0; m < 24 * 60; m += 10) {
      const alt = sunAltitude(new Date(Date.UTC(2026, 7, 16, 0, m)), ROME.lat, ROME.lon);
      if (alt > -6 && alt < 6) golden += 1;
    }
    // due crepuscoli al giorno, qualche campione ciascuno: mai zero, mai ore
    expect(golden).toBeGreaterThanOrEqual(4);
    expect(golden).toBeLessThan(24);
  });

  it("anche giove gira col cielo, e non sta mai dritto sopra Roma", () => {
    const altitudes: number[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(Date.UTC(2026, 7, 16, hour));
      for (const body of visiblePlanets(at, ROME.lat, ROME.lon)) {
        if (body.name === "giove") altitudes.push(body.altitude);
      }
    }
    // l'eclittica da 42°N non passa mai per lo zenit: un pianeta a 90° è un
    // errore di trasformazione, non un cielo possibile
    for (const altitude of altitudes) expect(altitude).toBeLessThan(75);
  });
});
