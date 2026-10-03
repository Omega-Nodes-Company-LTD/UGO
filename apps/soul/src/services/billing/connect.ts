import type { StripeClient } from "./stripe.js";

/**
 * Stripe Connect Express (ADR-131): l'allevamento apre il suo conto presso
 * Stripe, che verifica l'identità e versa i soldi. Noi conserviamo l'id del
 * conto e tre fatti (può incassare, può ricevere versamenti, quante cose
 * mancano) — mai documenti né IBAN.
 */

export interface ConnectState {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: number;
}

/** Un conto Express nuovo, per un allevamento italiano. */
export async function createExpressAccount(stripe: StripeClient, accountId: string): Promise<string> {
  const created = await stripe.call<{ id: string }>(
    "POST",
    "/v1/accounts",
    {
      type: "express",
      country: "IT",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { account_id: accountId },
    },
    `connect-${accountId}`,
  );
  return created.id;
}

/** Il percorso di Stripe per completare il conto: monouso, scade da solo. */
export async function onboardingLink(
  stripe: StripeClient,
  stripeAccountId: string,
  urls: { refresh: string; back: string },
): Promise<string> {
  const link = await stripe.call<{ url: string }>("POST", "/v1/account_links", {
    account: stripeAccountId,
    type: "account_onboarding",
    refresh_url: urls.refresh,
    return_url: urls.back,
  });
  return link.url;
}

/** La dashboard Express dell'allevatore: versamenti, ricevute, dati. */
export async function dashboardLink(stripe: StripeClient, stripeAccountId: string): Promise<string> {
  const link = await stripe.call<{ url: string }>("POST", `/v1/accounts/${encodeURIComponent(stripeAccountId)}/login_links`, {});
  return link.url;
}

/** Lo stato di un conto, dall'oggetto `account` di Stripe (webhook `account.updated`). */
export function connectStateOf(account: Record<string, unknown>): ConnectState | undefined {
  if (typeof account.id !== "string") return undefined;
  const due = (account.requirements as { currently_due?: unknown[] } | undefined)?.currently_due;
  return {
    stripeAccountId: account.id,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    requirementsDue: Array.isArray(due) ? due.length : 0,
  };
}

/**
 * Il rimborso di un'adozione annullata dopo il pagamento (ADR-126 §5). Con
 * Connect si storna anche il trasferimento all'allevatore e la nostra
 * commissione: chi rinuncia riavrà tutto, e nessuno resta con soldi non suoi.
 */
export async function refundAdoption(stripe: StripeClient, paymentIntent: string, connect: boolean): Promise<void> {
  await stripe.call(
    "POST",
    "/v1/refunds",
    { payment_intent: paymentIntent, ...(connect && { reverse_transfer: true, refund_application_fee: true }) },
    `refund-${paymentIntent}`,
  );
}

/** La commissione del mercato, in centesimi, arrotondata a favore dell'allevatore. */
export function marketFeeCents(priceCents: number, feePct: number): number {
  return Math.floor((priceCents * feePct) / 100);
}
