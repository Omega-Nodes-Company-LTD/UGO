import { places, rooms, slugOfRoom, type DbClient } from "@ugo/db";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { resolveAccount } from "./scope.js";

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
  /**
   * Facoltativo di proposito: assente = si guarda solo il ripiego
   * d'ambiente, che è ciò che serve ai test di questa rotta (mappatura dei
   * codici WMO e memo, senza database). In produzione c'è sempre.
   */
  db?: DbClient;
  /**
   * Il ripiego storico: `UGO_HOME_LAT`/`UGO_HOME_LON` nell'ambiente.
   *
   * Resta solo per non spegnere il cielo alle installazioni che l'hanno già
   * configurato così, ed è **deprecato**: le coordinate sono della CASA
   * (`accounts.lat/lon`, dal pannello), perché con quelle nell'ambiente del
   * processo servire due famiglie significa due server — cioè il contrario di
   * ADR-019. Quando la casa ha il suo posto, questo non viene nemmeno letto.
   */
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
  const memo = new Map<string, { at: number; body: object }>();

  app.get("/v1/weather", async (request, reply) => {
    // la casa prima dell'ambiente: il corpo non porta un token, e
    // `resolveAccount` sa già rispondere «l'unica che c'è» in quel caso
    const db = deps.db;
    let home = deps.home;
    const scope = db === undefined ? undefined : await resolveAccount(db, request);
    if (db !== undefined && scope?.ok === true) {
      /**
       * ADR-113: il cielo è del **luogo**, non del titolare.
       *
       * Se chi chiede dice da quale stanza (`?stanza=`), si prende il luogo di
       * quella stanza: la cucina al mare e quella in città non hanno lo stesso
       * tempo, ed è tutta la ragione per cui i luoghi esistono. Senza stanza si
       * prende il primo luogo dell'account — che per una famiglia con un posto
       * solo è esattamente quello di prima.
       */
      const asked = (request.query as { stanza?: string } | undefined)?.stanza;
      const rows = await db
        .select({ lat: places.lat, lon: places.lon })
        .from(places)
        .where(eq(places.accountId, scope.accountId))
        .orderBy(asc(places.createdAt));
      let picked = rows[0];
      if (asked !== undefined && asked.trim() !== "") {
        const [room] = await db
          .select({ lat: places.lat, lon: places.lon })
          .from(rooms)
          .innerJoin(places, eq(places.id, rooms.placeId))
          .where(and(eq(rooms.accountId, scope.accountId), eq(rooms.slug, slugOfRoom(asked))));
        if (room !== undefined) picked = room;
      }
      if (picked?.lat != null && picked.lon != null) {
        home = { lat: Number(picked.lat), lon: Number(picked.lon) };
      }
    }
    if (home === undefined) {
      // «non disponibile» e non un errore: una casa che non ha ancora detto
      // dove sta è uno stato normale, e il pannello sa chiederlo
      return reply.send({ available: false });
    }
    const now = deps.now?.() ?? Date.now();
    // il memo è per COORDINATE, non per processo: con due case a bordo, una
    // chiave sola serviva a tutte il tempo della prima che aveva chiesto
    const key = `${home.lat.toFixed(3)},${home.lon.toFixed(3)}`;
    const remembered = memo.get(key);
    if (remembered !== undefined && now - remembered.at < MEMO_TTL_MS) {
      return reply.send(remembered.body);
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
      memo.set(key, { at: now, body });
      return await reply.send(body);
    } catch {
      // meteo irraggiungibile: il cielo resta quello di prima, dichiarandolo.
      // Niente memo del fallimento: al prossimo giro si riprova
      return reply.send({ available: false });
    }
  });
}
