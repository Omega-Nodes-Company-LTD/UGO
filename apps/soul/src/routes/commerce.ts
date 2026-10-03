import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import type { DeliveryDeps } from "../services/adoptionDelivery.js";
import type { Mailer } from "../services/auth/mailer.js";
import type { PayPalClient } from "../services/billing/paypal.js";
import type { PlanGate } from "../services/billing/plan.js";
import type { StripeClient } from "../services/billing/stripe.js";
import { registerAdoptionCheckout } from "./adoptionCheckout.js";
import { registerBillingRoutes } from "./billing.js";
import { registerCreditRoutes } from "./credit.js";
import type { PreHandler } from "./guard.js";
import { registerWebhookRoutes } from "./webhooks.js";

/**
 * L'incasso, montato tutto insieme (ADR-125, ADR-126, ADR-130): abbonamento,
 * credito, pagamento delle adozioni e le porte dei PSP.
 */

export interface BillingOptions {
  plans: PlanGate;
  masterKey: Buffer;
  stripe?: StripeClient | undefined;
  paypal?: PayPalClient | undefined;
  mailer?: Mailer | undefined;
  /** il sito pubblico; assente = l'origine della richiesta */
  siteUrl?: string | undefined;
}

export function registerCommerce(
  app: FastifyInstance,
  deps: { db: DbClient; guard: PreHandler; billing: BillingOptions; delivery: Omit<DeliveryDeps, "db" | "log"> },
): void {
  const { db, guard, billing } = deps;
  const psp = { stripe: billing.stripe, paypal: billing.paypal, siteUrl: billing.siteUrl };
  registerBillingRoutes(app, { db, guard, plans: billing.plans, ...psp });
  registerCreditRoutes(app, { db, guard, ...psp });
  registerAdoptionCheckout(app, { db, guard, ...psp });
  const log = { warn: (data: Record<string, unknown>, message: string) => { app.log.warn(data, message); } };
  registerWebhookRoutes(app, {
    db,
    masterKey: billing.masterKey,
    stripe: billing.stripe,
    paypal: billing.paypal,
    delivery: { db, ...deps.delivery, log },
    recharge: {
      db,
      masterKey: billing.masterKey,
      stripe: billing.stripe,
      paypal: billing.paypal,
      mailer: billing.mailer,
      siteUrl: billing.siteUrl,
      log,
    },
  });
}
