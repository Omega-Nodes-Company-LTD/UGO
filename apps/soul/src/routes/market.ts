import { gosini, listingReports, withAccount, withMarket, type DbClient } from "@ugo/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createExpressAccount, dashboardLink, onboardingLink } from "../services/billing/connect.js";
import { connectOf, saveConnectState } from "../services/billing/market.js";
import type { StripeClient } from "../services/billing/stripe.js";
import { problem, siteOf } from "./billing.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Il mercato dei cuccioli (ADR-131): il conto con cui un allevamento incassa,
 * e le segnalazioni sugli annunci.
 *
 * Il conto si apre e si completa presso Stripe; qui si chiede il link e si
 * legge lo stato, che arriva dal webhook `account.updated`.
 */

export interface MarketRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  stripe?: StripeClient | undefined;
  siteUrl?: string | undefined;
}

const reportSchema = z.object({
  motivo: z.enum(["maltrattamento", "ingannevole", "prezzo", "altro"]),
  nota: z.string().trim().max(500).optional(),
});
const resolveSchema = z.object({ azione: z.enum(["sospendi", "archivia"]) });

export function registerMarketRoutes(app: FastifyInstance, deps: MarketRoutesDeps): void {
  const owner = { requireAdmin: true };

  app.get("/v1/allevamento/pagamenti", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await inAccount(deps.db, request, reply, owner, (_db, id) => Promise.resolve(id));
    if (accountId === undefined) return reply;
    const state = await connectOf(deps.db, accountId);
    return reply.send({
      configurato: deps.stripe !== undefined,
      conto:
        state === undefined
          ? null
          : { incassa: state.chargesEnabled, versamenti: state.payoutsEnabled, mancano: state.requirementsDue },
    });
  });

  /** Apre il conto (la prima volta) e torna il link di Stripe per completarlo. */
  app.post("/v1/allevamento/pagamenti", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await inAccount(deps.db, request, reply, owner, (_db, id) => Promise.resolve(id));
    if (accountId === undefined) return reply;
    if (!(await guardBreeding(deps.db, accountId, "alleva", reply))) return reply;
    if (deps.stripe === undefined) return problem(reply, 501, "Stripe non è configurato");
    let state = await connectOf(deps.db, accountId);
    if (state === undefined) {
      const id = await createExpressAccount(deps.stripe, accountId);
      state = { stripeAccountId: id, chargesEnabled: false, payoutsEnabled: false, requirementsDue: 0 };
      await saveConnectState(deps.db, accountId, state);
    }
    const back = `${siteOf(deps, request)}/casa#/allevamento`;
    const url = await onboardingLink(deps.stripe, state.stripeAccountId, { refresh: back, back: `${back}?esito=ok` });
    return reply.send({ url });
  });

  app.post("/v1/allevamento/pagamenti/dashboard", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await inAccount(deps.db, request, reply, owner, (_db, id) => Promise.resolve(id));
    if (accountId === undefined) return reply;
    const state = await connectOf(deps.db, accountId);
    if (deps.stripe === undefined || state === undefined) return problem(reply, 404, "nessun conto di versamento");
    return reply.send({ url: await dashboardLink(deps.stripe, state.stripeAccountId) });
  });

  /** Segnalare un annuncio: serve un account, ma non serve essere di quella casa. */
  app.post("/v1/vetrina/:id/segnala", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success || !z.uuid().safeParse(id).success) return problem(reply, 400, "scegli un motivo");
    const reporter = await inAccount(deps.db, request, reply, {}, (_db, accountId) => Promise.resolve(accountId));
    if (reporter === undefined) return reply;
    // chi vende si legge dal mercato: la vetrina attraversa le case per disegno
    const kennel = await withMarket(deps.db, async (db) => {
      const [cub] = await db
        .select({ kennel: gosini.accountId })
        .from(gosini)
        .where(and(eq(gosini.id, id), isNotNull(gosini.listedAt)));
      return cub?.kennel;
    });
    if (kennel === undefined) return problem(reply, 404, "non è in vetrina");
    await withAccount(deps.db, reporter, (tx) =>
      tx.insert(listingReports).values({
        gosinoId: id,
        kennelAccountId: kennel,
        reporterAccountId: reporter,
        reason: parsed.data.motivo,
        ...(parsed.data.nota !== undefined && parsed.data.nota !== "" && { note: parsed.data.nota }),
      }),
    );
    return reply.code(201).send({ ok: true });
  });

  // l'operatore — e solo lui: chi segnala non diventa giudice
  const operatorOnly = (role: string | undefined): boolean => role === "operator";

  app.get("/v1/operatore/segnalazioni", { preHandler: deps.guard }, async (request, reply) => {
    if (!operatorOnly(request.tenant?.role)) return problem(reply, 403, "solo l'operatore");
    const rows = await withMarket(deps.db, (db) =>
      db
        .select({
          id: listingReports.id,
          gosinoId: listingReports.gosinoId,
          gosinoName: gosini.name,
          motivo: listingReports.reason,
          nota: listingReports.note,
          stato: listingReports.status,
          at: listingReports.createdAt,
        })
        .from(listingReports)
        .innerJoin(gosini, eq(gosini.id, listingReports.gosinoId))
        .orderBy(desc(listingReports.createdAt))
        .limit(100),
    );
    return reply.send({ segnalazioni: rows });
  });

  app.post("/v1/operatore/segnalazioni/:id", { preHandler: deps.guard }, async (request, reply) => {
    if (!operatorOnly(request.tenant?.role)) return problem(reply, 403, "solo l'operatore");
    const { id } = request.params as { id: string };
    const parsed = resolveSchema.safeParse(request.body);
    if (!parsed.success || !z.uuid().safeParse(id).success) return problem(reply, 400, "sospendi o archivia");
    const done = await withMarket(deps.db, async (db) => {
      const [report] = await db
        .update(listingReports)
        .set({ status: parsed.data.azione === "sospendi" ? "sospeso" : "archiviata", resolvedAt: new Date() })
        .where(eq(listingReports.id, id))
        .returning({ gosinoId: listingReports.gosinoId });
      if (report === undefined) return false;
      // sospendere = togliere dalla vetrina; l'allevamento lo vede e può rimetterlo
      if (parsed.data.azione === "sospendi") {
        await db.update(gosini).set({ listedAt: null }).where(eq(gosini.id, report.gosinoId));
      }
      return true;
    });
    if (!done) return problem(reply, 404, "segnalazione non trovata");
    return reply.send({ ok: true });
  });
}
