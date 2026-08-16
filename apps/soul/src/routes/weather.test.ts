import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerWeatherRoute, weatherKindOf } from "./weather.js";

/**
 * Il meteo per il cielo del recinto (gruppo 12). Il fetcher è iniettato: qui
 * si prova la rotta — memo di mezz'ora, degradazione onesta, coordinate in
 * risposta — non open-meteo, che non ha bisogno dei nostri test.
 */

const apps: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe("weatherKindOf: i codici WMO ridotti a ciò che il cielo disegna", () => {
  it("sereno, coperto, bagnato", () => {
    expect(weatherKindOf(0)).toBe("clear");
    expect(weatherKindOf(2)).toBe("clear");
    expect(weatherKindOf(3)).toBe("cloudy");
    expect(weatherKindOf(45)).toBe("cloudy");
    expect(weatherKindOf(61)).toBe("rain");
    expect(weatherKindOf(95)).toBe("rain");
  });
});

describe("GET /v1/weather", () => {
  it("senza coordinate risponde «non disponibile», senza chiamare nessuno", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    let called = 0;
    registerWeatherRoute(app, {
      fetchWeather: () => {
        called += 1;
        return Promise.resolve({ code: 0, isDay: true });
      },
    });
    const response = await app.inject({ method: "GET", url: "/v1/weather" });
    expect(response.json()).toEqual({ available: false });
    expect(called).toBe(0);
  });

  it("risponde il tempo, memoizza mezz'ora, e allo scadere richiede", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    let now = 0;
    let called = 0;
    registerWeatherRoute(app, {
      home: { lat: 41.9, lon: 12.5 },
      now: () => now,
      fetchWeather: () => {
        called += 1;
        return Promise.resolve({ code: 61, isDay: false });
      },
    });
    const first = await app.inject({ method: "GET", url: "/v1/weather" });
    expect(first.json()).toEqual({
      available: true,
      kind: "rain",
      isDay: false,
      lat: 41.9,
      lon: 12.5,
    });
    now += 10 * 60_000;
    await app.inject({ method: "GET", url: "/v1/weather" });
    expect(called).toBe(1); // dentro il memo: open-meteo non si martella
    now += 25 * 60_000;
    await app.inject({ method: "GET", url: "/v1/weather" });
    expect(called).toBe(2);
  });

  it("il meteo irraggiungibile degrada a «non disponibile» e NON si memoizza", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    let fail = true;
    let called = 0;
    registerWeatherRoute(app, {
      home: { lat: 41.9, lon: 12.5 },
      now: () => called * 1000,
      fetchWeather: () => {
        called += 1;
        return fail ? Promise.reject(new Error("down")) : Promise.resolve({ code: 0, isDay: true });
      },
    });
    const broken = await app.inject({ method: "GET", url: "/v1/weather" });
    expect(broken.json()).toEqual({ available: false });
    fail = false;
    const healed = await app.inject({ method: "GET", url: "/v1/weather" });
    expect(healed.json<{ available: boolean }>().available).toBe(true);
  });
});
