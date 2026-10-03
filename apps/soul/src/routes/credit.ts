import { creditLedger, creditSettings, type DbClient } from "@ugo/db";
import { creditBalanceMicros } from "@ugo/memory";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { customId, type PayPalClient } from "../services/billing/paypal.js";
import type { StripeClient } from "../services/billing/stripe.js";
import { problem, siteOf } from "./billing.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Il credito della casa, dal pannello (ADR-130): saldo, movimenti, ricarica a
 * mano, ricarica automatica. La ricarica apre il pagamento; il credito lo
 * scrive solo il webhook.
 */

export interface CreditRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  stripe?: StripeClient | undefined;
  paypal?: PayPalClient | undefined;
  siteUrl?: string | undefined;
}

/** da 5 a 500 euro: sotto non vale la commissione, sopra è un errore di battitura */
const topupSchema = z.object({ euro: z.number().int().min(5).max(500), via: z.enum(["stripe", "paypal"]) });
const settingsSchema = z.object({
  automatica: z.boolean(),
  sogliaEuro: z.number().min(0).max(100),
  importoEuro: z.number().int().min(5).max(200),
  tettoMeseEuro: z.number().int().min(5).max(1000),
});

export function registerCreditRoutes(app: FastifyInstance, deps: CreditRoutesDeps): void {
  const owner = { requireAdmin: true };

  app.get("/v1/credito", { preHandler: deps.guard }, async (request, reply) => {
    const found = await inAccount(deps.db, request, reply, owner, async (db, accountId) => {
      const [settings] = await db.select().from(creditSettings).where(eq(creditSettings.accountId, accountId));
      const moves = await db
        .select({ kind: creditLedger.kind, micros: creditLedger.amountMicros, at: creditLedger.createdAt })
        .from(creditLedger)
        .where(eq(creditLedger.accountId, accountId))
        .orderBy(desc(creditLedger.createdAt))
        .limit(50);
      return { saldo: await creditBalanceMicros(db, accountId), settings, moves };
    });
    if (found === undefined) return reply;
    const s = found.settings;
    return reply.send({
      saldoMicros: found.saldo,
      automatica: {
        attiva: s?.autoRecharge ?? false,
        sogliaMicros: s?.thresholdMicros ?? 2_000_000,
        importoMicros: s?.amountMicros ?? 10_000_000,
        tettoMeseMicros: s?.monthlyCapMicros ?? 50_000_000,
        metodo: s?.provider ?? null,
        spenta: s?.disabledReason ?? null,
      },
      movimenti: found.moves,
      vie: { stripe: deps.stripe !== undefined, paypal: deps.paypal !== undefined },
    });
  });

  app.put("/v1/credito/impostazioni", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "valori non validi");
    const p = parsed.data;
    const values = {
      autoRecharge: p.automatica,
      thresholdMicros: Math.round(p.sogliaEuro * 1_000_000),
      amountMicros: p.importoEuro * 1_000_000,
      monthlyCapMicros: p.tettoMeseEuro * 1_000_000,
      // riaccenderla è la risposta a «si è spenta da sola»
      ...(p.automatica && { disabledReason: null, failures: 0 }),
      updatedAt: new Date(),
    };
    const done = await inAccount(deps.db, request, reply, owner, async (db, accountId) => {
      const [row] = await db.select({ provider: creditSettings.provider }).from(creditSettings).where(eq(creditSettings.accountId, accountId));
      if (p.automatica && row?.provider == null) return "no-method" as const;
      await db.insert(creditSettings).values({ accountId, ...values }).onConflictDoUpdate({ target: creditSettings.accountId, set: values });
      return "ok" as const;
    });
    if (done === undefined) return reply;
    if (done === "no-method") return problem(reply, 409, "serve prima una ricarica a mano: è lì che si salva il metodo di pagamento");
    return reply.send({ ok: true });
  });

  app.post("/v1/credito/ricarica", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = topupSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "da 5 a 500 euro");
    const accountId = await inAccount(deps.db, request, reply, owner, (_db, id) => Promise.resolve(id));
    if (accountId === undefined) return reply;
    const back = `${siteOf(deps, request)}/casa#/credito`;
    const cents = parsed.data.euro * 100;
    if (parsed.data.via === "stripe") {
      if (deps.stripe === undefined) return problem(reply, 501, "Stripe non è configurato");
      const url = await deps.stripe.checkoutPayment({
        accountId,
        purpose: "topup",
        amountCents: cents,
        name: "Credito UGO",
        saveMethod: true,
        successUrl: `${back}?esito=ok`,
        cancelUrl: back,
      });
      return reply.send({ url });
    }
    if (deps.paypal === undefined) return problem(reply, 501, "PayPal non è configurato");
    const url = await deps.paypal.createOrder({
      custom: customId("topup", accountId),
      amountCents: cents,
      description: "Credito UGO",
      vault: true,
      returnUrl: `${siteOf(deps, request)}/pagamenti/paypal/ritorno`,
      cancelUrl: back,
    });
    return reply.send({ url });
  });
}
