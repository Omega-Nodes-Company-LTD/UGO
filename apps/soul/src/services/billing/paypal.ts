/**
 * PayPal, con `fetch` (ADR-125, ADR-130): OAuth client-credentials, Abbonamenti,
 * Orders v2 col vault per la ricarica automatica, e la verifica dei webhook
 * chiesta a PayPal stesso (`verify-webhook-signature`). Il `custom_id` di ogni
 * oggetto dice di che casa è (`paypalIds.ts`).
 */

import { customId } from "./paypalIds.js";

export { customId, parseCustomId, verifyPayPalWebhook } from "./paypalIds.js";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  apiBase?: string | undefined;
  plans: { pro?: string | undefined; allevamento?: string | undefined };
}

export class PayPalError extends Error {
  public constructor(public readonly status: number) {
    super(`paypal answered ${String(status)}`);
    this.name = "PayPalError";
  }
}

const euros = (cents: number): string => (cents / 100).toFixed(2);

interface Link {
  rel: string;
  href: string;
}

export class PayPalClient {
  private readonly base: string;
  private token: { value: string; until: number } | undefined;

  public constructor(private readonly config: PayPalConfig) {
    this.base = config.apiBase ?? "https://api-m.paypal.com";
  }

  public get webhookId(): string {
    return this.config.webhookId;
  }

  public planFor(plan: "pro" | "allevamento"): string | undefined {
    return this.config.plans[plan];
  }

  /** Il piano UGO di un piano PayPal: chi l'ha comprato lo dice l'id. */
  public planOf(paypalPlanId: unknown): "pro" | "allevamento" | undefined {
    if (paypalPlanId === this.config.plans.pro) return "pro";
    if (paypalPlanId === this.config.plans.allevamento) return "allevamento";
    return undefined;
  }

  private async bearer(): Promise<string> {
    if (this.token !== undefined && this.token.until > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const response = await fetch(new URL("/v1/oauth2/token", this.base), {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new PayPalError(response.status);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    // un minuto di margine: un token che scade a metà chiamata è un 401 inutile
    this.token = { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
    return body.access_token;
  }

  /** Una chiamata autenticata: per le rotte che non hanno un metodo qui sopra. */
  public async call<T>(method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
    const response = await fetch(new URL(path, this.base), {
      method,
      headers: {
        authorization: `Bearer ${await this.bearer()}`,
        "content-type": "application/json",
        ...(requestId !== undefined && { "paypal-request-id": requestId }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new PayPalError(response.status);
    return (await response.json().catch(() => ({}))) as T;
  }

  private static approval(links: Link[] | undefined): string {
    const href = links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
    if (href === undefined) throw new PayPalError(502);
    return href;
  }

  public async createSubscription(input: {
    accountId: string;
    planId: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const created = await this.call<{ links?: Link[] }>("POST", "/v1/billing/subscriptions", {
      plan_id: input.planId,
      custom_id: customId("subscription", input.accountId),
      application_context: { return_url: input.returnUrl, cancel_url: input.cancelUrl, user_action: "SUBSCRIBE_NOW" },
    });
    return PayPalClient.approval(created.links);
  }

  /** Un ordine da approvare: ricarica (con vault) o adozione. */
  public async createOrder(input: {
    custom: string;
    amountCents: number;
    description: string;
    vault: boolean;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const created = await this.call<{ links?: Link[] }>("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.custom,
          description: input.description,
          amount: { currency_code: "EUR", value: euros(input.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          ...(input.vault && { attributes: { vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT" } } }),
          experience_context: { return_url: input.returnUrl, cancel_url: input.cancelUrl, user_action: "PAY_NOW" },
        },
      },
    });
    return PayPalClient.approval(created.links);
  }

  /**
   * Il ritorno dall'approvazione: si incassa. Il credito arriva dal webhook
   * della cattura; qui si raccoglie solo il token del vault, se c'è.
   */
  public async captureOrder(orderId: string): Promise<{ custom?: string; vaultId?: string }> {
    const done = await this.call<{
      purchase_units?: { payments?: { captures?: { custom_id?: string }[] } }[];
      payment_source?: { paypal?: { attributes?: { vault?: { id?: string; status?: string } } } };
    }>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`);
    const vault = done.payment_source?.paypal?.attributes?.vault;
    const custom = done.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id;
    return {
      ...(custom !== undefined && { custom }),
      ...(vault?.id !== undefined && { vaultId: vault.id }),
    };
  }

  /** La ricarica automatica sul token del vault: un ordine che si incassa da sé. */
  public async chargeVaulted(input: {
    accountId: string;
    vaultId: string;
    amountCents: number;
    requestId: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const order = await this.call<{ status?: string }>(
        "POST",
        "/v2/checkout/orders",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              custom_id: customId("recharge", input.accountId),
              amount: { currency_code: "EUR", value: euros(input.amountCents) },
            },
          ],
          payment_source: { paypal: { vault_id: input.vaultId } },
        },
        input.requestId,
      );
      return order.status === "COMPLETED" ? { ok: true } : { ok: false, reason: order.status ?? "unknown" };
    } catch (error) {
      return { ok: false, reason: error instanceof PayPalError ? `http-${String(error.status)}` : "unreachable" };
    }
  }

  /** Il rimborso di una cattura (ADR-126 §5): tutto, non una parte. */
  public async refundCapture(captureId: string): Promise<void> {
    await this.call("POST", `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {}, `refund-${captureId}`);
  }

  public async cancelSubscription(id: string): Promise<void> {
    await this.call("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: "Disdetta UGO" });
  }
}
