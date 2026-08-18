import { households, type DbClient } from "@ugo/db";
import { asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import type { AuditLogger } from "../services/auditLog.js";
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

const newHouseSchema = z.object({
  slug: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  // ADR-061: in italiano dove lo leggono le persone, home/business nel database
  kind: z.enum(["casa", "azienda"]).optional(),
  timezone: z.string().min(1).max(60).optional(),
  /**
   * ADR-082: **niente più `gosinoName` da qui.** Coniare un capostipite è un
   * atto d'allevamento, e il pannello crea case di famiglia: nascono vuote e
   * ricevono un nato. Chi conia lo fa dalla riga di comando, che è dove stanno
   * le decisioni dell'allevamento.
   */
});

const houseSettingsSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    kind: z.enum(["home", "business"]).optional(),
    timezone: z.string().min(1).max(60).optional(),
    locale: z.string().min(2).max(20).optional(),
    dailyBudgetUsd: z.number().min(0).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "niente da cambiare");

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
  deps: {
    db: DbClient;
    guard: PreHandler;
    findPlace?: (query: string) => Promise<FoundPlace[]>;
    /** ADR-061: far nascere una casa dal pannello; assente = solo da CLI */
    createHouse?: (input: {
      slug: string;
      name: string;
      kind?: "casa" | "azienda" | undefined;
      timezone?: string | undefined;
    }) => Promise<{ householdId: string; slug: string; persona: string; ownerToken: string; tokenId: string }>;
    audit?: AuditLogger;
  },
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

  /**
   * `POST /v1/households` — nasce una casa.
   *
   * Esisteva solo come `ugo casa nuova` sulla riga di comando, cioè non
   * esisteva per chi il pannello lo usa: ADR-061 dice che una persona può
   * avere più case e più negozi, e finché crearne una voleva dire entrare nel
   * container quella promessa era scritta e basta.
   *
   * Il token del proprietario torna UNA VOLTA SOLA, come dal CLI: in database
   * esiste solo come SHA-256, e se si perde si riemette — non si recupera.
   */
  app.post("/v1/households", { preHandler: deps.guard }, async (request, reply) => {
    const tenant = request.tenant ?? null;
    // solo un operatore: creare una casa non è amministrare la propria
    if (tenant === null || !canAdminister(tenant) || tenant.householdId !== null) {
      return reply
        .code(403)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Forbidden", status: 403 });
    }
    const parsed = newHouseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).type("application/problem+json").send({
        type: "about:blank",
        title: "Invalid household",
        status: 400,
        detail: z.prettifyError(parsed.error),
      });
    }
    if (deps.createHouse === undefined) {
      return reply
        .code(501)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Household creation not configured", status: 501 });
    }
    try {
      const born = await deps.createHouse(parsed.data);
      await deps.audit?.record({
        verb: "household_created",
        outcome: "ok",
        householdId: born.householdId,
        resourceType: "household",
        resourceId: born.householdId,
      });
      await deps.audit?.record({
        verb: "token_issued",
        outcome: "ok",
        householdId: born.householdId,
        resourceType: "token",
        resourceId: born.tokenId,
      });
      return await reply.code(201).send(born);
    } catch (error) {
      return reply.code(409).type("application/problem+json").send({
        type: "about:blank",
        title: "Household not created",
        status: 409,
        detail: error instanceof Error ? error.message : "slug già in uso",
      });
    }
  });

  /** `PATCH /v1/household` — nome, natura, fuso, lingua, tetto di spesa. */
  app.patch("/v1/household", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = houseSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).type("application/problem+json").send({
        type: "about:blank",
        title: "Invalid settings",
        status: 400,
        detail: z.prettifyError(parsed.error),
      });
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { dailyBudgetUsd, ...rest } = parsed.data;
    await deps.db
      .update(households)
      .set({
        ...rest,
        ...(dailyBudgetUsd !== undefined && { dailyBudgetUsd: dailyBudgetUsd.toFixed(4) }),
      })
      .where(eq(households.id, householdId));
    return reply.send({ ok: true });
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
        locale: households.locale,
        // il posto, per mostrarlo nell'elenco senza una seconda chiamata
        place: households.place,
        dailyBudgetUsd: households.dailyBudgetUsd,
        // ADR-081: cosa può fare questa casa. Il pannello deve **non offrire**
        // le porte che risponderebbero 403: un pulsante che rifiuta sempre è
        // peggio di un pulsante che non c'è
        isFoundry: households.isFoundry,
        canBreed: households.canBreed,
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
