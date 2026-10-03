import { subscriptions, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PayPalClient } from "../services/billing/paypal.js";
import type { PlanGate } from "../services/billing/plan.js";
import type { StripeClient } from "../services/billing/stripe.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * L'abbonamento, dal pannello (ADR-125); il credito sta in `credit.ts`. Tutte del
 * proprietario. Le rotte aprono il pagamento presso il PSP e tornano un
 * indirizzo; ciò che cambia davvero (il piano, il credito) lo scrive solo il
 * webhook.
 */

export interface BillingRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  plans: PlanGate;
  stripe?: StripeClient | undefined;
  paypal?: PayPalClient | undefined;
  /** il sito pubblico; assente = l'origine della richiesta (soul in casa) */
  siteUrl?: string | undefined;
}

const via = z.enum(["stripe", "paypal"]);
const checkoutSchema = z.object({ piano: z.enum(["pro", "allevamento"]), via });

export async function problem(reply: FastifyReply, status: number, detail: string): Promise<FastifyReply> {
  return reply.code(status).type("application/problem+json").send({ type: "about:blank", title: detail, status, detail });
}

export function siteOf(deps: { siteUrl?: string | undefined }, request: FastifyRequest): string {
  return deps.siteUrl ?? `${request.protocol}://${request.host}`;
}

export function registerBillingRoutes(app: FastifyInstance, deps: BillingRoutesDeps): void {
  const owner = { requireAdmin: true };

  app.get("/v1/abbonamento", { preHandler: deps.guard }, async (request, reply) => {
    const found = await inAccount(deps.db, request, reply, owner, async (db, accountId) => {
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId));
      return { view: await deps.plans.of(db, accountId), sub };
    });
    if (found === undefined) return reply;
    const { view, sub } = found;
    return reply.send({
      piano: view.plan,
      fonte: view.fonte,
      capacita: view.capacita,
      abbonamento:
        sub === undefined
          ? null
          : {
              provider: sub.provider,
              piano: sub.plan,
              stato: sub.status,
              finePeriodo: sub.currentPeriodEnd,
              disdetto: sub.cancelAtPeriodEnd,
            },
      vie: { stripe: deps.stripe !== undefined, paypal: deps.paypal !== undefined },
    });
  });

  app.post("/v1/abbonamento/checkout", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "scegli un piano e un modo di pagare");
    const { piano, via: by } = parsed.data;
    const back = `${siteOf(deps, request)}/casa#/abbonamento`;
    const customer = await inAccount(deps.db, request, reply, owner, async (db, accountId) => {
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId));
      return { accountId, customer: sub?.customerRef ?? undefined };
    });
    if (customer === undefined) return reply;
    if (by === "stripe") {
      const price = deps.stripe?.priceFor(piano);
      if (deps.stripe === undefined || price === undefined) return problem(reply, 501, "Stripe non è configurato");
      const url = await deps.stripe.checkoutSubscription({
        accountId: customer.accountId,
        plan: piano,
        price,
        customer: customer.customer,
        successUrl: `${back}?esito=ok`,
        cancelUrl: back,
      });
      return reply.send({ url });
    }
    const planId = deps.paypal?.planFor(piano);
    if (deps.paypal === undefined || planId === undefined) return problem(reply, 501, "PayPal non è configurato");
    const url = await deps.paypal.createSubscription({
      accountId: customer.accountId,
      planId,
      returnUrl: `${back}?esito=ok`,
      cancelUrl: back,
    });
    return reply.send({ url });
  });

  /** Stripe: il portale del cliente. PayPal: la disdetta (il resto si fa su PayPal). */
  app.post("/v1/abbonamento/portale", { preHandler: deps.guard }, async (request, reply) => {
    const sub = await inAccount(deps.db, request, reply, owner, async (db, accountId) => {
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId));
      return row ?? null;
    });
    if (sub === undefined) return reply;
    if (sub === null) return problem(reply, 404, "nessun abbonamento");
    if (sub.provider === "stripe" && deps.stripe !== undefined && sub.customerRef !== null) {
      return reply.send({ url: await deps.stripe.portal(sub.customerRef, `${siteOf(deps, request)}/casa#/abbonamento`) });
    }
    return problem(reply, 409, "per PayPal si gestisce dal tuo conto PayPal, o con «Disdici»");
  });

  app.post("/v1/abbonamento/disdici", { preHandler: deps.guard }, async (request, reply) => {
    const sub = await inAccount(deps.db, request, reply, owner, async (db, accountId) => {
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId));
      return row ?? null;
    });
    if (sub === undefined) return reply;
    if (sub === null) return problem(reply, 404, "nessun abbonamento");
    // vale fino alla fine del periodo pagato; lo stato nuovo arriva dal webhook
    if (sub.provider === "stripe" && deps.stripe !== undefined) await deps.stripe.cancelAtPeriodEnd(sub.externalId);
    else if (sub.provider === "paypal" && deps.paypal !== undefined) await deps.paypal.cancelSubscription(sub.externalId);
    else return problem(reply, 501, `${sub.provider} non è configurato`);
    return reply.code(202).send({ ok: true });
  });
}
