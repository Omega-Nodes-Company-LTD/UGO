import { verifyStripeSignature } from "@ugo/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { forgetEvent, saveMethod } from "../services/billing/ledger.js";
import { parseCustomId, verifyPayPalWebhook, type PayPalClient } from "../services/billing/paypal.js";
import type { StripeClient } from "../services/billing/stripe.js";
import { handlePayPalEvent, handleStripeEvent, type WebhookDeps } from "../services/billing/webhooks.js";

/**
 * Le porte dei PSP (ADR-125 §4-5). Aperte senza credenziali — chi bussa è
 * Stripe o PayPal — e per questo la prima cosa è la firma: Stripe sul corpo
 * GREZZO (un JSON riserializzato non ha più la stessa firma), PayPal
 * chiedendolo a PayPal.
 *
 * Un 5xx dice al PSP di riprovare: lo si risponde solo quando il lavoro si è
 * fermato a metà, e allora si toglie anche il segno di «già visto».
 */

export interface WebhookRoutesDeps extends WebhookDeps {
  stripe?: StripeClient | undefined;
  paypal?: PayPalClient | undefined;
}

const eventId = z.object({ id: z.string() });

async function ack(reply: FastifyReply, status: number): Promise<FastifyReply> {
  return reply.code(status).send({ received: status === 200 });
}

export function registerWebhookRoutes(app: FastifyInstance, deps: WebhookRoutesDeps): void {
  app.register((scope, _options, done) => {
    // solo qui dentro: il resto di soul continua a ricevere JSON già letto
    scope.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 512 * 1024 }, (_request, body, done) => {
      done(null, body);
    });

    scope.post("/webhooks/stripe", async (request, reply) => {
      if (deps.stripe === undefined) return ack(reply, 404);
      const raw = typeof request.body === "string" ? request.body : "";
      const signature = request.headers["stripe-signature"];
      if (!verifyStripeSignature(raw, typeof signature === "string" ? signature : undefined, deps.stripe.webhookSecret)) {
        request.log.warn({}, "stripe webhook with a bad signature");
        return ack(reply, 400);
      }
      const body: unknown = JSON.parse(raw);
      try {
        await handleStripeEvent(deps, body);
        return await ack(reply, 200);
      } catch (error) {
        const id = eventId.safeParse(body);
        if (id.success) await forgetEvent(deps.db, "stripe", id.data.id);
        request.log.error({ reason: error instanceof Error ? error.name : "unknown" }, "stripe webhook failed");
        return ack(reply, 500);
      }
    });

    scope.post("/webhooks/paypal", async (request, reply) => {
      const paypal = deps.paypal;
      if (paypal === undefined) return ack(reply, 404);
      const body: unknown = JSON.parse(typeof request.body === "string" ? request.body : "{}");
      if (!(await verifyPayPalWebhook(paypal, request.headers, body))) {
        request.log.warn({}, "paypal webhook not verified");
        return ack(reply, 400);
      }
      try {
        await handlePayPalEvent(deps, body);
        return await ack(reply, 200);
      } catch (error) {
        const id = eventId.safeParse(body);
        if (id.success) await forgetEvent(deps.db, "paypal", id.data.id);
        request.log.error({ reason: error instanceof Error ? error.name : "unknown" }, "paypal webhook failed");
        return ack(reply, 500);
      }
    });
    done();
  });

  /**
   * Il ritorno dall'approvazione di PayPal: qui si incassa l'ordine. Il credito
   * (o l'adozione pagata) arriva dal webhook della cattura; qui si salva solo
   * il token del vault per la ricarica automatica.
   */
  app.get("/pagamenti/paypal/ritorno", async (request, reply) => {
    const token = (request.query as { token?: unknown }).token;
    if (deps.paypal === undefined || typeof token !== "string" || !/^[A-Z0-9-]{5,64}$/.test(token)) {
      return reply.redirect("/casa", 303);
    }
    try {
      const captured = await deps.paypal.captureOrder(token);
      const custom = parseCustomId(captured.custom);
      if (custom?.purpose === "topup" && captured.vaultId !== undefined) {
        await saveMethod(deps.db, deps.masterKey, custom.accountId, { provider: "paypal", pointer: captured.vaultId });
      }
      return await reply.redirect(custom?.purpose === "adoption" ? "/casa#/adozioni?esito=ok" : "/casa#/credito?esito=ok", 303);
    } catch {
      return reply.redirect("/casa#/credito?esito=errore", 303);
    }
  });
}
