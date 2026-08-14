import { households, type DbClient } from "@ugo/db";
import { asc, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { canAdminister } from "../services/tenantAuth.js";

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
export function registerHouseholdRoutes(app: FastifyInstance, deps: { db: DbClient }): void {
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
