import type { DbClient } from "@ugo/db";
import { centsToMicros } from "@ugo/shared";
import { z } from "zod";
import { settleAdoption, type DeliveryDeps } from "../adoptionDelivery.js";
import { connectStateOf } from "./connect.js";
import { creditTopup, firstTime, saveMethod, saveSubscription } from "./ledger.js";
import { saveConnectState } from "./market.js";
import { parseCustomId, type PayPalClient } from "./paypal.js";
import { rechargeRefused, type RechargeDeps } from "./recharge.js";

/**
 * Cosa fa ogni evento dei PSP (ADR-125 §4: il webhook è l'unica fonte di
 * verità). Ogni evento si lavora una volta sola (`billing_events`); quelli che
 * non conosciamo si registrano e si ignorano, che è ciò che Stripe e PayPal
 * si aspettano da un 200.
 */

export interface WebhookDeps {
  db: DbClient;
  masterKey: Buffer;
  delivery: DeliveryDeps;
  recharge: RechargeDeps;
  paypal?: PayPalClient | undefined;
}

const meta = z.object({
  account_id: z.uuid(),
  purpose: z.enum(["subscription", "topup", "recharge", "adoption"]),
  plan: z.enum(["pro", "allevamento"]).optional(),
  ref: z.string().optional(),
});

const stripeEvent = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

const unix = (value: unknown): Date | undefined => (typeof value === "number" ? new Date(value * 1000) : undefined);
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

type Settled = "done" | "duplicate" | "ignored";

export async function handleStripeEvent(deps: WebhookDeps, body: unknown): Promise<Settled> {
  const event = stripeEvent.parse(body);
  if (!(await firstTime(deps.db, "stripe", event.id, event.type))) return "duplicate";
  const object = event.data.object;
  // ADR-131: il conto Connect di un allevamento è cambiato (verifica, versamenti)
  if (event.type === "account.updated") {
    const owner = z.object({ account_id: z.uuid() }).safeParse(object.metadata);
    const state = connectStateOf(object);
    if (!owner.success || state === undefined) return "ignored";
    await saveConnectState(deps.db, owner.data.account_id, state);
    return "done";
  }
  const m = meta.safeParse(object.metadata);
  if (!m.success) return "ignored";
  const { account_id: accountId, purpose } = m.data;

  if (event.type === "checkout.session.completed" && object.mode === "subscription" && m.data.plan !== undefined) {
    const id = text(object.subscription);
    if (id === undefined) return "ignored";
    await saveSubscription(deps.db, accountId, {
      provider: "stripe",
      externalId: id,
      customerRef: text(object.customer),
      plan: m.data.plan,
      status: "active",
    });
    return "done";
  }
  if (event.type.startsWith("customer.subscription.") && m.data.plan !== undefined) {
    await saveSubscription(deps.db, accountId, {
      provider: "stripe",
      externalId: text(object.id) ?? "",
      customerRef: text(object.customer),
      plan: m.data.plan,
      status: event.type === "customer.subscription.deleted" ? "canceled" : (text(object.status) ?? "incomplete"),
      currentPeriodEnd: unix(object.current_period_end),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
    });
    return "done";
  }
  if (event.type === "payment_intent.succeeded") {
    const ref = `stripe:${text(object.id) ?? event.id}`;
    const cents = typeof object.amount_received === "number" ? object.amount_received : 0;
    if (purpose === "adoption" && m.data.ref !== undefined) {
      await settleAdoption(deps.delivery, m.data.ref, { ref, provider: "stripe" });
      return "done";
    }
    if (purpose !== "topup" && purpose !== "recharge") return "ignored";
    await creditTopup(deps.db, accountId, { micros: centsToMicros(cents), ref, automatic: purpose === "recharge" });
    const customer = text(object.customer);
    const method = text(object.payment_method);
    if (purpose === "topup" && customer !== undefined && method !== undefined) {
      await saveMethod(deps.db, deps.masterKey, accountId, { provider: "stripe", pointer: `${customer}:${method}` });
    }
    return "done";
  }
  if (event.type === "payment_intent.payment_failed" && purpose === "recharge") {
    await rechargeRefused(deps.recharge, accountId, "declined");
    return "done";
  }
  return "ignored";
}

const paypalEvent = z.object({
  id: z.string(),
  event_type: z.string(),
  resource: z.record(z.string(), z.unknown()),
});

/** Gli stati di PayPal nella lingua di `LIVE_SUBSCRIPTION`. */
const PAYPAL_STATUS: Record<string, string> = {
  ACTIVE: "active",
  APPROVAL_PENDING: "incomplete",
  APPROVED: "incomplete",
  SUSPENDED: "unpaid",
  CANCELLED: "canceled",
  EXPIRED: "canceled",
};

export async function handlePayPalEvent(deps: WebhookDeps, body: unknown): Promise<Settled> {
  const event = paypalEvent.parse(body);
  if (!(await firstTime(deps.db, "paypal", event.id, event.event_type))) return "duplicate";
  const resource = event.resource;
  const custom = parseCustomId(resource.custom_id);
  if (custom === undefined || !z.uuid().safeParse(custom.accountId).success) return "ignored";

  if (event.event_type.startsWith("BILLING.SUBSCRIPTION.")) {
    const plan = deps.paypal?.planOf(resource.plan_id);
    if (plan === undefined) return "ignored";
    const billing = resource.billing_info as { next_billing_time?: string } | undefined;
    await saveSubscription(deps.db, custom.accountId, {
      provider: "paypal",
      externalId: text(resource.id) ?? "",
      plan,
      status: PAYPAL_STATUS[text(resource.status) ?? ""] ?? "incomplete",
      currentPeriodEnd: billing?.next_billing_time === undefined ? undefined : new Date(billing.next_billing_time),
    });
    return "done";
  }
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const amount = resource.amount as { value?: string } | undefined;
    const cents = Math.round(Number(amount?.value ?? "0") * 100);
    const ref = `paypal:${text(resource.id) ?? event.id}`;
    if (custom.purpose === "adoption" && custom.ref !== undefined) {
      await settleAdoption(deps.delivery, custom.ref, { ref, provider: "paypal" });
      return "done";
    }
    if (custom.purpose !== "topup" && custom.purpose !== "recharge") return "ignored";
    await creditTopup(deps.db, custom.accountId, {
      micros: centsToMicros(cents),
      ref,
      automatic: custom.purpose === "recharge",
    });
    return "done";
  }
  if (event.event_type === "PAYMENT.CAPTURE.DENIED" && custom.purpose === "recharge") {
    await rechargeRefused(deps.recharge, custom.accountId, "declined");
    return "done";
  }
  return "ignored";
}
