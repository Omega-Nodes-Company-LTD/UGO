import { gosini, adoptions, withMarket, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AdoptionService } from "../services/adoptionService.js";
import { marketFeeCents } from "../services/billing/connect.js";
import { sellerOf } from "../services/billing/market.js";
import { customId, type PayPalClient } from "../services/billing/paypal.js";
import type { StripeClient } from "../services/billing/stripe.js";
import { problem, siteOf } from "./billing.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Pagare un'adozione online (ADR-126): la porta che ADR-084 §3 aveva lasciato.
 *
 * Paga chi adotta, al prezzo CONGELATO alla prenotazione. Il pagamento lo
 * conferma il webhook, che chiama lo stesso `markPaid` dell'allevamento.
 * PayPal solo se chi cede è la fonderia: gli altri allevamenti incassano con
 * Stripe Connect (ADR-131) — destination charge, i soldi all'allevatore e la
 * commissione a noi — e finché un allevamento non ha il suo conto attivo il
 * pagamento online non si apre.
 */

export interface AdoptionCheckoutDeps {
  db: DbClient;
  guard: PreHandler;
  stripe?: StripeClient | undefined;
  paypal?: PayPalClient | undefined;
  siteUrl?: string | undefined;
  /** ADR-131: la commissione del mercato, in percento del prezzo */
  marketFeePct: number;
}

const schema = z.object({ via: z.enum(["stripe", "paypal"]) });

export function registerAdoptionCheckout(app: FastifyInstance, deps: AdoptionCheckoutDeps): void {
  app.post("/v1/adozioni/:id/checkout", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "scegli come pagare");
    const { id } = request.params as { id: string };
    if (!z.uuid().safeParse(id).success) return problem(reply, 404, "pratica non trovata");
    const buyer = await inAccount(deps.db, request, reply, { requireAdmin: true }, (_db, accountId) =>
      Promise.resolve(accountId),
    );
    if (buyer === undefined) return reply;

    // ADR-097: la pratica ha due case, e la si legge dal mercato
    const pratica = await withMarket(deps.db, async (db) => {
      const row = await new AdoptionService(db).ofBuyer(buyer, id);
      if (row === undefined) return undefined;
      const [cub] = await db
        .select({ name: gosini.name })
        .from(adoptions)
        .innerJoin(gosini, eq(gosini.id, adoptions.gosinoId))
        .where(eq(adoptions.id, id));
      return { ...row, name: cub?.name ?? "un cucciolo" };
    });
    if (pratica === undefined) return problem(reply, 404, "pratica non trovata");
    if (pratica.status !== "prenotata") return problem(reply, 409, `la pratica è già ${pratica.status}`);
    if (pratica.priceCents === null) return problem(reply, 409, "il prezzo si concorda con l'allevamento");
    if (pratica.priceCents === 0) return problem(reply, 409, "è un'adozione gratuita: non c'è niente da pagare");
    const seller = await sellerOf(deps.db, pratica.kennelAccountId);
    if (seller.kind === "offline") {
      return problem(reply, 409, "questo allevamento non incassa ancora online: accordati con lui");
    }

    const back = `${siteOf(deps, request)}/casa#/adozioni`;
    const name = `Adozione di ${pratica.name}`;
    if (parsed.data.via === "stripe") {
      if (deps.stripe === undefined) return problem(reply, 501, "Stripe non è configurato");
      const url = await deps.stripe.checkoutPayment({
        accountId: buyer,
        purpose: "adoption",
        ref: id,
        amountCents: pratica.priceCents,
        name,
        saveMethod: false,
        // ADR-131: fuori dalla fonderia i soldi vanno all'allevatore, meno la commissione
        ...(seller.kind === "connect" && {
          transfer: { destination: seller.destination, feeCents: marketFeeCents(pratica.priceCents, deps.marketFeePct) },
        }),
        successUrl: `${back}?esito=ok`,
        cancelUrl: back,
      });
      return reply.send({ url });
    }
    // PayPal multiparty chiede un'abilitazione da partner che non c'è (ADR-131 §4)
    if (seller.kind !== "foundry") return problem(reply, 409, "con questo allevamento si paga con la carta");
    if (deps.paypal === undefined) return problem(reply, 501, "PayPal non è configurato");
    const url = await deps.paypal.createOrder({
      custom: customId("adoption", buyer, id),
      amountCents: pratica.priceCents,
      description: name,
      vault: false,
      returnUrl: `${siteOf(deps, request)}/pagamenti/paypal/ritorno`,
      cancelUrl: back,
    });
    return reply.send({ url });
  });
}
