import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Network-level Stripe stub (TESTING_PLAYBOOK §3, priority 2). Stripe's test
 * mode needs real keys and a reachable webhook endpoint; the suites run the
 * real `fetch`, form-encoded, against this server, and read back what was
 * asked. Webhooks are not sent from here: tests sign events themselves with
 * `signStripePayload` (the same function the route verifies with) and post
 * them to soul.
 */

export interface StripeCall {
  method: string;
  path: string;
  /** the form body, flattened: `metadata[account_id]` stays a key */
  form: Record<string, string>;
  idempotencyKey: string | undefined;
  authorization: string | undefined;
}

export class StripeStub {
  public baseUrl = "";
  public readonly calls: StripeCall[] = [];
  /** the next off-session charge is declined with this code */
  public declineNext: string | undefined;
  private seq = 0;
  private server: Server | undefined;

  private next(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${String(this.seq)}`;
  }

  private answer(call: StripeCall): { status: number; body: unknown } {
    const route = `${call.method} ${call.path}`;
    if (route === "POST /v1/checkout/sessions") {
      const id = this.next("cs");
      return { status: 200, body: { id, url: `https://checkout.stripe.test/${id}` } };
    }
    if (route === "POST /v1/billing_portal/sessions") {
      return { status: 200, body: { url: `https://billing.stripe.test/${this.next("bps")}` } };
    }
    if (route === "POST /v1/payment_intents") {
      if (this.declineNext !== undefined) {
        const code = this.declineNext;
        this.declineNext = undefined;
        return { status: 402, body: { error: { type: "card_error", code } } };
      }
      return { status: 200, body: { id: this.next("pi"), status: "succeeded" } };
    }
    // ADR-131: Connect Express — conti, percorso di verifica, dashboard, rimborsi
    if (route === "POST /v1/accounts") return { status: 200, body: { id: this.next("acct"), type: "express" } };
    if (route === "POST /v1/account_links") {
      return { status: 200, body: { url: `https://connect.stripe.test/onboarding/${call.form.account ?? ""}` } };
    }
    if (call.method === "POST" && /^\/v1\/accounts\/[^/]+\/login_links$/.test(call.path)) {
      return { status: 200, body: { url: `https://connect.stripe.test/express/${call.path.split("/")[3] ?? ""}` } };
    }
    if (route === "POST /v1/refunds") return { status: 200, body: { id: this.next("re"), status: "succeeded" } };
    if (call.method === "DELETE" && call.path.startsWith("/v1/subscriptions/")) {
      return { status: 200, body: { id: call.path.split("/").at(-1), status: "canceled" } };
    }
    if (call.method === "POST" && call.path.startsWith("/v1/subscriptions/")) {
      return { status: 200, body: { id: call.path.split("/").at(-1), cancel_at_period_end: true } };
    }
    return { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing" } } };
  }

  public async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
        const key = req.headers["idempotency-key"];
        const call: StripeCall = {
          method: req.method ?? "GET",
          path: (req.url ?? "").split("?")[0] ?? "",
          form,
          idempotencyKey: typeof key === "string" ? key : undefined,
          authorization: req.headers.authorization,
        };
        this.calls.push(call);
        const { status, body } = this.answer(call);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  public last(path: string): StripeCall | undefined {
    return this.calls.filter((call) => call.path === path).at(-1);
  }

  public reset(): void {
    this.calls.length = 0;
    this.declineNext = undefined;
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

export async function startStripeStub(): Promise<StripeStub> {
  const stub = new StripeStub();
  await stub.start();
  return stub;
}
