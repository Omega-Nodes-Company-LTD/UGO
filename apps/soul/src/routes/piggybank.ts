import { budgetLedger, feedings, gosini, accounts, type DbClient } from "@ugo/db";
import { FEEDING_KINDS } from "@ugo/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

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
  const mine = async (db: DbClient, accountId: string, gosinoId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.accountId, accountId)));
    return row !== undefined;
  };

  app.get("/v1/gosini/:id/piggybank", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = await inAccount(deps.db, request, reply, {}, async (db, accountId) => {
    if (!(await mine(db, accountId, id))) return "missing" as const;

    const [house] = await db
      .select({ on: accounts.metabolism })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    const [fed] = await db
      .select({ total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
      .from(feedings)
      /**
       * ADR-082: **e della casa che guarda.** Da quando un nato può cambiare
       * casa (ADR-081), un saldo scopato sul solo esemplare sarebbe denaro che
       * si teletrasporta: la famiglia che compra il cucciolo si troverebbe in
       * pancia i pasti pagati dall'allevamento.
       */
      .where(and(eq(feedings.gosinoId, id), eq(feedings.accountId, accountId)));
    const [eaten] = await db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(and(eq(budgetLedger.gosinoId, id), eq(budgetLedger.accountId, accountId)));
    const meals = await db
      .select({
        kind: feedings.kind,
        amountUsd: feedings.amountUsd,
        note: feedings.note,
        at: feedings.at,
      })
      .from(feedings)
      .where(and(eq(feedings.gosinoId, id), eq(feedings.accountId, accountId)))
      .orderBy(desc(feedings.at))
      .limit(20);

    const fedUsd = Number(fed?.total ?? 0);
    const eatenUsd = Number(eaten?.total ?? 0);
    return {
      metabolism: house?.on ?? false,
      fedUsd,
      eatenUsd,
      balanceUsd: fedUsd - eatenUsd,
      // con il metabolismo spento il saldo si vede lo stesso: si guarda prima
      // di accendere, invece di scoprire una creatura affamata dopo
      hungry: (house?.on ?? false) && fedUsd - eatenUsd <= 0,
      meals: meals.map((meal) => ({ ...meal, amountUsd: Number(meal.amountUsd) })),
    };
    });
    if (body === undefined) return reply;
    if (body === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.send(body);
  });

  app.post("/v1/gosini/:id/feed", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = feedSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const body = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        if (!(await mine(db, accountId, id))) return "missing" as const;

        await db.insert(feedings).values({
          accountId,
          gosinoId: id,
          kind: parsed.data.kind,
          amountUsd: parsed.data.amountUsd.toFixed(6),
          ...(parsed.data.note !== undefined && { note: parsed.data.note }),
        });

        const [fed] = await db
          .select({ total: sql<string>`coalesce(sum(${feedings.amountUsd}), 0)` })
          .from(feedings)
          .where(eq(feedings.gosinoId, id));
        const [eaten] = await db
          .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
          .from(budgetLedger)
          .where(eq(budgetLedger.gosinoId, id));
        return { balanceUsd: Number(fed?.total ?? 0) - Number(eaten?.total ?? 0) };
      },
    );
    if (body === undefined) return reply;
    if (body === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.status(201).send(body);
  });

  /** L'interruttore del metabolismo, per la casa: acceso solo da chi sa cosa fa. */
  app.put("/v1/accounts/metabolism", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = z.object({ on: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      (db, accountId) =>
        db.update(accounts).set({ metabolism: parsed.data.on }).where(eq(accounts.id, accountId)),
    );
    if (done === undefined) return reply;
    return reply.send({ metabolism: parsed.data.on });
  });
}
