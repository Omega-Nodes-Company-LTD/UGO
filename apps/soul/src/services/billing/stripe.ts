/**
 * Stripe, con `fetch` e nient'altro (ADR-125): poche chiamate, tutte qui. Il
 * corpo è form-encoded come vuole l'API; ogni scrittura che può essere
 * ripetuta porta una chiave di idempotenza, così un retry non addebita due
 * volte.
 *
 * Sull'oggetto del PSP mettiamo sempre `metadata[account_id]` e
 * `metadata[purpose]`: il webhook sa così di che casa è l'evento senza dover
 * cercare fra le case (che sotto RLS non potrebbe nemmeno vedere).
 */

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  apiBase?: string | undefined;
  prices: { pro?: string | undefined; allevamento?: string | undefined };
}

export type Purpose = "subscription" | "topup" | "recharge" | "adoption";

export class StripeError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string | undefined,
  ) {
    super(`stripe answered ${String(status)}${code === undefined ? "" : ` (${code})`}`);
    this.name = "StripeError";
  }
}

interface Form {
  [key: string]: string | number | boolean | undefined | Form;
}

/** `{a: {b: 1}}` → `a[b]=1`, come lo legge Stripe. */
export function formEncode(form: Form, prefix = ""): string[] {
  return Object.entries(form).flatMap(([key, value]) => {
    if (value === undefined) return [];
    const name = prefix === "" ? key : `${prefix}[${key}]`;
    if (typeof value === "object") return formEncode(value, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`];
  });
}

interface CheckoutInput {
  accountId: string;
  successUrl: string;
  cancelUrl: string;
}

export class StripeClient {
  private readonly base: string;

  public constructor(private readonly config: StripeConfig) {
    this.base = config.apiBase ?? "https://api.stripe.com";
  }

  public get webhookSecret(): string {
    return this.config.webhookSecret;
  }

  public priceFor(plan: "pro" | "allevamento"): string | undefined {
    return this.config.prices[plan];
  }

  private async call<T>(method: string, path: string, form?: Form, idempotencyKey?: string): Promise<T> {
    const response = await fetch(new URL(path, this.base), {
      method,
      headers: {
        authorization: `Bearer ${this.config.secretKey}`,
        ...(form !== undefined && { "content-type": "application/x-www-form-urlencoded" }),
        ...(idempotencyKey !== undefined && { "idempotency-key": idempotencyKey }),
      },
      ...(form !== undefined && { body: formEncode(form).join("&") }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string } } & T;
    if (!response.ok) throw new StripeError(response.status, body.error?.code);
    return body;
  }

  public async checkoutSubscription(
    input: CheckoutInput & { plan: "pro" | "allevamento"; price: string; customer?: string | undefined },
  ): Promise<string> {
    const meta = { account_id: input.accountId, purpose: "subscription", plan: input.plan };
    const session = await this.call<{ url: string }>("POST", "/v1/checkout/sessions", {
      mode: "subscription",
      line_items: { "0": { price: input.price, quantity: 1 } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.accountId,
      customer: input.customer,
      metadata: meta,
      subscription_data: { metadata: meta },
    });
    return session.url;
  }

  public async portal(customer: string, returnUrl: string): Promise<string> {
    const session = await this.call<{ url: string }>("POST", "/v1/billing_portal/sessions", {
      customer,
      return_url: returnUrl,
    });
    return session.url;
  }

  /**
   * Un pagamento singolo: una ricarica (che salva il metodo per la ricarica
   * automatica) o un'adozione. Il credito NON si accredita qui: lo fa il
   * webhook `payment_intent.succeeded` (ADR-130 §4).
   */
  public async checkoutPayment(
    input: CheckoutInput & {
      purpose: "topup" | "adoption";
      amountCents: number;
      name: string;
      ref?: string | undefined;
      saveMethod: boolean;
    },
  ): Promise<string> {
    const meta = { account_id: input.accountId, purpose: input.purpose, ref: input.ref };
    const session = await this.call<{ url: string }>("POST", "/v1/checkout/sessions", {
      mode: "payment",
      line_items: {
        "0": {
          quantity: 1,
          price_data: { currency: "eur", unit_amount: input.amountCents, product_data: { name: input.name } },
        },
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.accountId,
      ...(input.saveMethod && { customer_creation: "always" }),
      metadata: meta,
      payment_intent_data: {
        metadata: meta,
        ...(input.saveMethod && { setup_future_usage: "off_session" }),
      },
    });
    return session.url;
  }

  /** La ricarica automatica: senza la persona davanti, sul metodo salvato. */
  public async chargeOffSession(input: {
    accountId: string;
    customer: string;
    paymentMethod: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
    try {
      const intent = await this.call<{ id: string; status: string }>(
        "POST",
        "/v1/payment_intents",
        {
          amount: input.amountCents,
          currency: "eur",
          customer: input.customer,
          payment_method: input.paymentMethod,
          off_session: true,
          confirm: true,
          metadata: { account_id: input.accountId, purpose: "recharge" },
        },
        input.idempotencyKey,
      );
      return intent.status === "succeeded" || intent.status === "processing"
        ? { ok: true, id: intent.id }
        : { ok: false, reason: intent.status };
    } catch (error) {
      return { ok: false, reason: error instanceof StripeError ? (error.code ?? "declined") : "unreachable" };
    }
  }

  /** Alla chiusura dell'account (ADR-124 §9): subito, non a fine periodo. */
  public async cancelSubscription(id: string): Promise<void> {
    await this.call("DELETE", `/v1/subscriptions/${encodeURIComponent(id)}`);
  }

  /** Disdetta dal pannello: vale fino alla fine del periodo pagato. */
  public async cancelAtPeriodEnd(id: string): Promise<void> {
    await this.call("POST", `/v1/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: true });
  }
}
