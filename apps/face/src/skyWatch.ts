import { moonPhase, moonPosition, sunAltitude, visiblePlanets } from "./body/ephemeris.js";
import type { SkyState, SkyWeather } from "./body/room3d.js";

/**
 * Il cielo del recinto segue quello vero (gruppo 12).
 *
 * Ogni mezz'ora si chiede a soul che tempo fa — è SOUL a parlare con
 * open-meteo, una volta per casa e mai dal browser — e da lì il corpo decide
 * il suo cielo: la tavolozza dal meteo, e di notte la luna con la sua fase e
 * i pianeti a occhio nudo, calcolati QUI con le effemeridi (`ephemeris.ts`),
 * zero rete. Senza coordinate configurate la rotta risponde «non
 * disponibile» e il cielo resta quello di sempre: il meteo si accende, non
 * si subisce.
 */

export const SKY_POLL_MS = 30 * 60_000;

export interface WeatherAnswer {
  available: boolean;
  kind?: SkyWeather;
  isDay?: boolean;
  lat?: number;
  lon?: number;
}

/** l'ora d'oro: il sole fra queste due quote — è la definizione civile del crepuscolo */
const GOLDEN_BELOW = 6;
const GOLDEN_ABOVE = -6;

/** La risposta di soul diventa lo stato del cielo — pura, e quindi provabile. */
export function skyStateFrom(answer: WeatherAnswer | undefined, at: Date): SkyState | undefined {
  if (answer?.available !== true || answer.kind === undefined) return undefined;
  // le coordinate arrivano insieme al meteo, così si configurano in un posto
  // solo; senza, si ripiega sull'is_day di open-meteo (niente ora d'oro)
  const lat = answer.lat;
  const lon = answer.lon;
  if (lat === undefined || lon === undefined) {
    return { mode: answer.isDay !== false ? "day" : "night", weather: answer.kind };
  }
  // gruppo 13: alba e tramonto VERI — il sole calcolato decide il cielo, agli
  // orari di casa tua e non a ore fisse
  const sun = sunAltitude(at, lat, lon);
  if (sun >= GOLDEN_BELOW) return { mode: "day", weather: answer.kind };
  if (sun > GOLDEN_ABOVE) return { mode: "golden", weather: answer.kind };
  return {
    mode: "night",
    weather: answer.kind,
    night: {
      moon: { ...moonPhase(at), ...moonPosition(at, lat, lon) },
      planets: visiblePlanets(at, lat, lon),
    },
  };
}

/** fra un meteo e l'altro il SOLE si muove: il modo si ricalcola più spesso */
export const SKY_RECHECK_MS = 5 * 60_000;

/** Il giro: meteo ogni mezz'ora, sole ogni cinque minuti — l'ora d'oro dura
 * poco e un cielo che se la perde è un cielo che non fa i tramonti. */
export function watchSky(soulHttp: string, apply: (state: SkyState) => void): void {
  let lastAnswer: WeatherAnswer | undefined;
  const applyNow = (): void => {
    const state = skyStateFrom(lastAnswer, new Date());
    if (state !== undefined) apply(state);
  };
  const tick = async (): Promise<void> => {
    try {
      const response = await fetch(`${soulHttp}/v1/weather`);
      lastAnswer = (await response.json()) as WeatherAnswer;
      applyNow();
    } catch {
      // soul o il meteo irraggiungibili: il cielo di prima non è sbagliato
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, SKY_POLL_MS);
  setInterval(applyNow, SKY_RECHECK_MS);
}
