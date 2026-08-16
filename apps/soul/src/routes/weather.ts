import type { FastifyInstance } from "fastify";

/**
 * Il meteo vero, per il cielo del recinto (gruppo 12).
 *
 * open-meteo: gratis, senza chiave, senza registrazione. La chiamata la fa
 * SOUL e non il chiosco, per tre ragioni che sono la stessa: un solo punto
 * che parla con l'esterno, un memo di mezz'ora invece di uno per schermo, e
 * il browser del corpo che non contatta mai terze parti — la posizione della
 * casa esce da qui una volta ogni mezz'ora, non da ogni dispositivo.
 *
 * Aperta come `/v1/rooms`: il corpo non porta un token. Quel che esce è il
 * tempo che fa fuori dalla finestra, che chiunque in casa può vedere alzando
 * la testa.
 */

const MEMO_TTL_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

/** i codici WMO di open-meteo, ridotti a ciò che il cielo sa disegnare */
export function weatherKindOf(wmoCode: number): "clear" | "cloudy" | "rain" {
  if (wmoCode <= 2) return "clear"; // sereno o poco nuvoloso
  if (wmoCode === 3 || wmoCode === 45 || wmoCode === 48) return "cloudy";
  return "rain"; // pioggia, neve, temporali: per il recinto è «coperto e bagnato»
}

export interface WeatherDeps {
  /** dove sta la casa; assente = la rotta risponde «non disponibile» */
  home?: { lat: number; lon: number };
  /** iniettabile nei test: il vero è open-meteo */
  fetchWeather?: (lat: number, lon: number) => Promise<{ code: number; isDay: boolean }>;
  now?: () => number;
}

async function fromOpenMeteo(lat: number, lon: number): Promise<{ code: number; isDay: boolean }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${String(lat)}&longitude=${String(lon)}` +
    "&current=weather_code,is_day";
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`open-meteo status ${String(response.status)}`);
  const body = (await response.json()) as {
    current?: { weather_code?: number; is_day?: number };
  };
  return {
    code: body.current?.weather_code ?? 0,
    isDay: (body.current?.is_day ?? 1) === 1,
  };
}

export function registerWeatherRoute(app: FastifyInstance, deps: WeatherDeps): void {
  let memo: { at: number; body: object } | undefined;

  app.get("/v1/weather", async (_request, reply) => {
    const home = deps.home;
    if (home === undefined) {
      return reply.send({ available: false });
    }
    const now = deps.now?.() ?? Date.now();
    if (memo !== undefined && now - memo.at < MEMO_TTL_MS) {
      return reply.send(memo.body);
    }
    try {
      const current = await (deps.fetchWeather ?? fromOpenMeteo)(home.lat, home.lon);
      const body = {
        available: true,
        kind: weatherKindOf(current.code),
        isDay: current.isDay,
        // il chiosco calcola il SUO cielo notturno: gli servono le coordinate,
        // e prenderle da qui evita di configurarle due volte
        lat: home.lat,
        lon: home.lon,
      };
      memo = { at: now, body };
      return await reply.send(body);
    } catch {
      // meteo irraggiungibile: il cielo resta quello di prima, dichiarandolo.
      // Niente memo del fallimento: al prossimo giro si riprova
      return reply.send({ available: false });
    }
  });
}
