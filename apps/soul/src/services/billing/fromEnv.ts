import { subscriptions, withAccount, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { SoulEnv } from "../../config/env.js";
import type { BillingOptions } from "../../routes/commerce.js";
import type { Mailer } from "../auth/mailer.js";
import { PayPalClient } from "./paypal.js";
import { PlanGate } from "./plan.js";
import { maybeRecharge, type RechargeDeps } from "./recharge.js";
import { StripeClient } from "./stripe.js";

/**
 * L'incasso dall'ambiente (ADR-125). Ogni PSP esiste solo se è configurato per
 * intero: una chiave senza il segreto del webhook sarebbe un incasso di cui
 * non sapremmo mai l'esito.
 */

export interface Billing {
  options: BillingOptions;
  /** il gancio del cancello: dopo un addebito, forse una ricarica */
  onCreditDebited: (accountId: string) => void;
  /** alla chiusura dell'account: l'abbonamento si ferma subito (ADR-124 §9) */
  cancel: (accountId: string) => Promise<void>;
}

const PAYPAL_BASE = { live: "https://api-m.paypal.com", sandbox: "https://api-m.sandbox.paypal.com" };

export function billingFromEnv(
  env: SoulEnv,
  deps: {
    db: DbClient;
    masterKey: Buffer;
    mailer?: Mailer | undefined;
    log: { warn: (data: Record<string, unknown>, message: string) => void };
  },
): Billing {
  const stripe =
    env.STRIPE_SECRET_KEY !== undefined && env.STRIPE_WEBHOOK_SECRET !== undefined
      ? new StripeClient({
          secretKey: env.STRIPE_SECRET_KEY,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
          apiBase: env.STRIPE_API_BASE,
          prices: { pro: env.STRIPE_PRICE_PRO, allevamento: env.STRIPE_PRICE_ALLEVAMENTO },
        })
      : undefined;
  const paypal =
    env.PAYPAL_CLIENT_ID !== undefined && env.PAYPAL_CLIENT_SECRET !== undefined && env.PAYPAL_WEBHOOK_ID !== undefined
      ? new PayPalClient({
          clientId: env.PAYPAL_CLIENT_ID,
          clientSecret: env.PAYPAL_CLIENT_SECRET,
          webhookId: env.PAYPAL_WEBHOOK_ID,
          apiBase: env.PAYPAL_API_BASE ?? PAYPAL_BASE[env.PAYPAL_ENV],
          plans: { pro: env.PAYPAL_PLAN_PRO, allevamento: env.PAYPAL_PLAN_ALLEVAMENTO },
        })
      : undefined;
  // ADR-125: davanti a internet chi non paga è free; in casa nessuno vende a se stesso
  const plans = new PlanGate(env.UGO_PUBLIC === "on" ? "free" : "allevamento");
  const recharge: RechargeDeps = {
    db: deps.db,
    masterKey: deps.masterKey,
    stripe,
    paypal,
    mailer: deps.mailer,
    siteUrl: env.PUBLIC_URL,
    log: deps.log,
  };
  return {
    options: {
      plans,
      masterKey: deps.masterKey,
      stripe,
      paypal,
      mailer: deps.mailer,
      siteUrl: env.PUBLIC_URL,
      marketFeePct: env.UGO_MARKET_FEE_PCT,
    },
    onCreditDebited: (accountId) => {
      maybeRecharge(recharge, accountId).catch((error: unknown) => {
        deps.log.warn({ accountId, reason: error instanceof Error ? error.name : "unknown" }, "recharge check failed");
      });
    },
    cancel: async (accountId) => {
      const sub = await withAccount(deps.db, accountId, async (tx) => {
        const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.accountId, accountId));
        return row;
      });
      if (sub === undefined || sub.status === "canceled") return;
      if (sub.provider === "stripe") await stripe?.cancelSubscription(sub.externalId);
      else await paypal?.cancelSubscription(sub.externalId);
    },
  };
}
