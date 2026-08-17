import { households, type DbClient } from "@ugo/db";
import { asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";
import { canAdminister } from "../services/tenantAuth.js";

/**
 * Cercare un posto per nome, con l'API di geocoding di open-meteo: gratis,
 * senza chiave, senza registrazione — la stessa postura del meteo, e lo
 * stesso unico punto che parla con l'esterno (mai il browser di casa).
 *
 * Serve perché le coordinate NON si chiedono a una persona. «41.9, 12.5» non
 * lo sa nessuno; «Torino» sì. Si cerca, si sceglie da una lista, e ciò che
 * finisce nel database sono i numeri più l'etichetta scelta, così il pannello
 * può rimostrare il posto e non due decimali senza significato.
 */
const GEOCODE_TIMEOUT_MS = 8_000;

export interface FoundPlace {
  label: string;
  lat: number;
  lon: number;
}

export async function searchPlace(query: string): Promise<FoundPlace[]> {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(query)}&count=5&language=it&format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`geocoding status ${String(response.status)}`);
  const body = (await response.json()) as {
    results?: { name?: string; admin1?: string; country?: string; latitude?: number; longitude?: number }[];
  };
  return (body.results ?? [])
    .filter(
      (row): row is { name: string; admin1?: string; country?: string; latitude: number; longitude: number } =>
        typeof row.name === "string" &&
        typeof row.latitude === "number" &&
        typeof row.longitude === "number",
    )
    .map((row) => ({
      // «Torino, Piemonte, Italia»: senza il contorno, sei Torini diverse
      // sono sei righe identiche e la scelta è un tiro di dadi
      label: [row.name, row.admin1, row.country].filter((part) => part !== undefined && part !== "").join(", "),
      lat: row.latitude,
      lon: row.longitude,
    }));
}

const placeSchema = z.object({
  place: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/**
 * `GET /v1/households` — quali case posso vedere (ADR-019 fase 3).
 *
 * Serve al selettore del pannello, e la regola è la stessa del resto del
 * vicinato: **un token vede la propria casa e basta**. Solo un `operator` — che
 * è chi amministra l'installazione, non un membro di una famiglia — le vede
 * tutte, perché è l'unico per cui «quale casa?» è una domanda aperta.
 *
 * Restituisce sempre una lista, anche di uno solo: il pannello decide di
 * mostrare il selettore quando ce n'è più d'una, e il proprietario che ha una
 * casa sola non vede alcun cambiamento (promessa di ADR-019 §107).
 *
 * Le case chiuse non compaiono. `closedAt` è la chiusura logica di una
 * famiglia, e continuare a offrirla in un menu sarebbe invitare a scriverci.
 */
export function registerHouseholdRoutes(
  app: FastifyInstance,
  deps: { db: DbClient; guard: PreHandler; findPlace?: (query: string) => Promise<FoundPlace[]> },
): void {
  /**
   * `GET /v1/places?q=…` — cerca un posto. Guardata: è una chiamata verso
   * l'esterno, e si fa fare solo a chi amministra.
   */
  app.get("/v1/places", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = z.object({ q: z.string().min(2).max(120) }).safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid query", status: 400 });
    }
    try {
      const found = await (deps.findPlace ?? searchPlace)(parsed.data.q);
      return await reply.send({ places: found });
    } catch {
      // la classe basta: l'operatore deve sapere che la ricerca non ha
      // funzionato, non perché — e riprovare è gratis
      return reply
        .code(503)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Geocoding unavailable", status: 503 });
    }
  });

  /** `GET /v1/household/place` — dove sta, per rimostrarlo nel pannello. */
  app.get("/v1/household/place", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const [row] = await deps.db
      .select({ place: households.place, lat: households.lat, lon: households.lon })
      .from(households)
      .where(eq(households.id, householdId));
    return reply.send({
      place: row?.place ?? null,
      lat: row?.lat == null ? null : Number(row.lat),
      lon: row?.lon == null ? null : Number(row.lon),
    });
  });

  /**
   * `PUT /v1/household/place` — dove sta questa casa.
   *
   * Sostituisce `UGO_HOME_LAT`/`UGO_HOME_LON`, che erano dell'ambiente del
   * processo: con quelle, servire due famiglie voleva dire due server. Qui il
   * posto è della casa, come il fuso e la lingua.
   */
  app.put("/v1/household/place", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = placeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid place", status: 400, detail: z.prettifyError(parsed.error) });
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    await deps.db
      .update(households)
      .set({
        place: parsed.data.place,
        lat: parsed.data.lat.toFixed(5),
        lon: parsed.data.lon.toFixed(5),
      })
      .where(eq(households.id, householdId));
    return reply.send({ place: parsed.data.place, lat: parsed.data.lat, lon: parsed.data.lon });
  });

  app.get("/v1/households", async (request, reply) => {
    const tenant = request.tenant ?? null;
    if (tenant === null) {
      return reply
        .code(401)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Unauthorized", status: 401 });
    }

    const all = deps.db
      .select({
        id: households.id,
        slug: households.slug,
        name: households.name,
        // ADR-061: casa o azienda — il selettore lo mostra, perché chi
        // possiede entrambe deve vedere in quale mondo sta scrivendo
        kind: households.kind,
        timezone: households.timezone,
      })
      .from(households)
      .where(isNull(households.closedAt))
      .orderBy(asc(households.createdAt));

    // niente `?casa=` qui, ed è voluto: questa è la rotta che *risponde* a
    // «quali case», quindi non può chiederne una in ingresso
    if (canAdminister(tenant) && tenant.householdId === null) {
      return reply.send({ households: await all });
    }
    const mine = tenant.householdId;
    if (mine === null) return reply.send({ households: [] });
    return reply.send({
      households: (await all).filter((house) => house.id === mine),
    });
  });
}
