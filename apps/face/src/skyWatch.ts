import { moonPhase, moonPosition, visiblePlanets } from "./body/ephemeris.js";
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

/** La risposta di soul diventa lo stato del cielo — pura, e quindi provabile. */
export function skyStateFrom(answer: WeatherAnswer | undefined, at: Date): SkyState | undefined {
  if (answer?.available !== true || answer.kind === undefined) return undefined;
  if (answer.isDay !== false) return { mode: "day", weather: answer.kind };
  // di notte servono le coordinate per sapere DOVE stanno luna e pianeti; la
  // rotta le manda insieme al meteo, così si configurano in un posto solo
  const lat = answer.lat ?? 45;
  const lon = answer.lon ?? 9;
  return {
    mode: "night",
    weather: answer.kind,
    night: {
      moon: { ...moonPhase(at), ...moonPosition(at, lat, lon) },
      planets: visiblePlanets(at, lat, lon),
    },
  };
}

/** Il giro: adesso, e poi ogni mezz'ora. Un cielo irraggiungibile resta com'era. */
export function watchSky(soulHttp: string, apply: (state: SkyState) => void): void {
  const tick = async (): Promise<void> => {
    try {
      const response = await fetch(`${soulHttp}/v1/weather`);
      const state = skyStateFrom((await response.json()) as WeatherAnswer, new Date());
      if (state !== undefined) apply(state);
    } catch {
      // soul o il meteo irraggiungibili: il cielo di prima non è sbagliato
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, SKY_POLL_MS);
}
