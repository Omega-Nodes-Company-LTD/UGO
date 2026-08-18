import { budgetLedger, feedings, gosini, households, type DbClient } from "@ugo/db";
import { FEEDING_KINDS } from "@ugo/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * Il salvadanaio (ADR-072): quanto ha in pancia, e il gesto di dargli da
 * mangiare.
 *
 * Onestà che vale la pena ripetere dove qualcuno la leggerà: **il gosino non
 * fattura**. Fattura il suo umano, e qui gli attribuisce una quota. È
 * contabilità interna, non un conto corrente di una creatura.
 */

const feedSchema = z.object({
  kind: z.enum(FEEDING_KINDS),
  /** in USD come il ledger: è l'unità in cui il mangiare costa davvero */
  amountUsd: z.number().positive().max(1000),
  note: z.string().max(140).optional(),
});

export interface PiggyBankRoutesDeps {
  db: DbClient;
  guard: PreHandler;
}

export function registerPiggyBankRoutes(app: FastifyInstance, deps: PiggyBankRoutesDeps): void {
  const mine = async (householdId: string, gosinoId: string): Promise<boolean> => {
    const [row] = await deps.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.householdId, householdId)));
    return row !== undefined;
  };

  app.get("/v1/gosini/:id/piggybank", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    if (!(await mine(householdId, id))) return reply.status(404).send({ error: "non esiste" });

    const [house] = await deps.db
      .select({ on: households.metabolism })
      .from(households)
      .where(eq(households.id, householdId));
    const [fed] = await deps.db
      .select({ total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
      .from(feedings)
      /**
       * ADR-082: **e della casa che guarda.** Da quando un nato può cambiare
       * casa (ADR-081), un saldo scopato sul solo esemplare sarebbe denaro che
       * si teletrasporta: la famiglia che compra il cucciolo si troverebbe in
       * pancia i pasti pagati dall'allevamento.
       */
      .where(and(eq(feedings.gosinoId, id), eq(feedings.householdId, householdId)));
    const [eaten] = await deps.db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(and(eq(budgetLedger.gosinoId, id), eq(budgetLedger.householdId, householdId)));
    const meals = await deps.db
      .select({
        kind: feedings.kind,
        amountUsd: feedings.amountUsd,
        note: feedings.note,
        at: feedings.at,
      })
      .from(feedings)
      .where(and(eq(feedings.gosinoId, id), eq(feedings.householdId, householdId)))
      .orderBy(desc(feedings.at))
      .limit(20);

    const fedUsd = Number(fed?.total ?? 0);
    const eatenUsd = Number(eaten?.total ?? 0);
    return reply.send({
      metabolism: house?.on ?? false,
      fedUsd,
      eatenUsd,
      balanceUsd: fedUsd - eatenUsd,
      // con il metabolismo spento il saldo si vede lo stesso: si guarda prima
      // di accendere, invece di scoprire una creatura affamata dopo
      hungry: (house?.on ?? false) && fedUsd - eatenUsd <= 0,
      meals: meals.map((meal) => ({ ...meal, amountUsd: Number(meal.amountUsd) })),
    });
  });

  app.post("/v1/gosini/:id/feed", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = feedSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    if (!(await mine(householdId, id))) return reply.status(404).send({ error: "non esiste" });

    await deps.db.insert(feedings).values({
      householdId,
      gosinoId: id,
      kind: parsed.data.kind,
      amountUsd: parsed.data.amountUsd.toFixed(6),
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
    });

    const [fed] = await deps.db
      .select({ total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
      .from(feedings)
      .where(eq(feedings.gosinoId, id));
    const [eaten] = await deps.db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(eq(budgetLedger.gosinoId, id));
    return reply
      .status(201)
      .send({ balanceUsd: Number(fed?.total ?? 0) - Number(eaten?.total ?? 0) });
  });

  /** L'interruttore del metabolismo, per la casa: acceso solo da chi sa cosa fa. */
  app.put("/v1/households/metabolism", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = z.object({ on: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    await deps.db
      .update(households)
      .set({ metabolism: parsed.data.on })
      .where(eq(households.id, householdId));
    return reply.send({ metabolism: parsed.data.on });
  });
}
