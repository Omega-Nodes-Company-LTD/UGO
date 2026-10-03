import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Network-level PayPal stub (TESTING_PLAYBOOK §3, priority 2): OAuth,
 * Subscriptions, Orders v2 with vault, and `verify-webhook-signature`. The
 * client in src/ performs the real HTTP calls; this server answers in
 * PayPal's shapes and remembers what it was asked.
 */

export interface PayPalCall {
  method: string;
  path: string;
  body: Record<string, unknown>;
  requestId: string | undefined;
}

export class PayPalStub {
  public baseUrl = "";
  public readonly calls: PayPalCall[] = [];
  /** what `verify-webhook-signature` answers */
  public verifies = true;
  /** the next vaulted charge comes back not completed */
  public declineNext = false;
  /** custom_id of each order, to give it back at capture time */
  private readonly customs = new Map<string, string>();
  private seq = 0;
  private server: Server | undefined;

  private next(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${String(this.seq)}`;
  }

  private answer(call: PayPalCall): { status: number; body: unknown } {
    const route = `${call.method} ${call.path}`;
    if (route === "POST /v1/oauth2/token") return { status: 200, body: { access_token: "A21-stub", expires_in: 3600 } };
    if (route === "POST /v1/billing/subscriptions") {
      const id = this.next("I");
      return { status: 201, body: { id, links: [{ rel: "approve", href: `https://paypal.test/approve/${id}` }] } };
    }
    if (route === "POST /v2/checkout/orders") {
      const id = this.next("ORDER");
      const unit = (call.body.purchase_units as { custom_id?: string }[] | undefined)?.[0];
      if (unit?.custom_id !== undefined) this.customs.set(id, unit.custom_id);
      const source = call.body.payment_source as { paypal?: { vault_id?: string } } | undefined;
      if (source?.paypal?.vault_id !== undefined) {
        const declined = this.declineNext;
        this.declineNext = false;
        return { status: 201, body: { id, status: declined ? "PAYER_ACTION_REQUIRED" : "COMPLETED" } };
      }
      return { status: 201, body: { id, links: [{ rel: "payer-action", href: `https://paypal.test/pay/${id}` }] } };
    }
    if (call.method === "POST" && /^\/v2\/checkout\/orders\/[^/]+\/capture$/.test(call.path)) {
      const id = call.path.split("/")[4] ?? "";
      return {
        status: 201,
        body: {
          id,
          status: "COMPLETED",
          purchase_units: [{ payments: { captures: [{ id: this.next("CAP"), custom_id: this.customs.get(id) }] } }],
          payment_source: { paypal: { attributes: { vault: { id: "VAULT-1", status: "VAULTED" } } } },
        },
      };
    }
    if (call.method === "POST" && /^\/v1\/billing\/subscriptions\/[^/]+\/cancel$/.test(call.path)) {
      return { status: 204, body: {} };
    }
    if (route === "POST /v1/notifications/verify-webhook-signature") {
      return { status: 200, body: { verification_status: this.verifies ? "SUCCESS" : "FAILURE" } };
    }
    return { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
  }

  public async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const isJson = (req.headers["content-type"] ?? "").includes("json");
        const requestId = req.headers["paypal-request-id"];
        const call: PayPalCall = {
          method: req.method ?? "GET",
          path: (req.url ?? "").split("?")[0] ?? "",
          body: isJson && raw !== "" ? (JSON.parse(raw) as Record<string, unknown>) : {},
          requestId: typeof requestId === "string" ? requestId : undefined,
        };
        this.calls.push(call);
        const { status, body } = this.answer(call);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(status === 204 ? "" : JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  public last(path: string): PayPalCall | undefined {
    return this.calls.filter((call) => call.path === path).at(-1);
  }

  public reset(): void {
    this.calls.length = 0;
    this.verifies = true;
    this.declineNext = false;
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

export async function startPayPalStub(): Promise<PayPalStub> {
  const stub = new PayPalStub();
  await stub.start();
  return stub;
}
