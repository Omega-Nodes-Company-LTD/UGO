import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  adoptions,
  breederPayoutAccounts,
  createDbClient,
  gosini,
  listingReports,
  runMigrations,
  traitSets,
  type DbClient,
} from "@ugo/db";
import { startPostgres, startStripeStub, type StripeStub } from "@ugo/factories";
import { generateDataKey, signStripePayload } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { createAccount, createAccountWithFounder } from "../../src/services/accountService.js";
import { PlanGate } from "../../src/services/billing/plan.js";
import { StripeClient } from "../../src/services/billing/stripe.js";

/**
 * ADR-131: il mercato paga l'allevatore. Postgres vero, Stripe su uno stub di
 * rete vero: la commissione e il conto di destinazione si leggono nella
 * richiesta che soul ha davvero mandato, il rimborso pure.
 */

const MASTER = generateDataKey();
const WHSEC = "whsec_mercato";
const OPERATOR = "operatore-del-mercato";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let stripe: StripeStub;
let app: FastifyInstance;
let breeder = "";
let breederToken = "";
let buyer = "";
let buyerToken = "";
let cub = "";

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  stripe = await startStripeStub();
  const kennel = await createAccountWithFounder(db, MASTER, {
    slug: "allevamento-rosa",
    name: "Allevamento Rosa",
    gosinoName: "Capo",
    breeder: true,
  });
  breeder = kennel.accountId;
  breederToken = kennel.ownerToken;
  await db.update(accounts).set({ planGrant: "allevamento" }).where(eq(accounts.id, breeder));
  const family = await createAccount(db, MASTER, { slug: "famiglia-bianchi", name: "Bianchi" });
  buyer = family.accountId;
  buyerToken = family.ownerToken;
  await db.update(accounts).set({ planGrant: "pro" }).where(eq(accounts.id, buyer));
  const [born] = await db
    .insert(gosini)
    .values({ accountId: breeder, name: "Fiocco", origin: "nato", generation: 1 })
    .returning({ id: gosini.id });
  cub = born?.id ?? "";
  await db.insert(traitSets).values({ accountId: breeder, gosinoId: cub, version: 1, traits: { calm: 0.4 } });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    billing: {
      plans: new PlanGate("free"),
      masterKey: MASTER,
      stripe: new StripeClient({ secretKey: "sk_test", webhookSecret: WHSEC, apiBase: stripe.baseUrl, prices: {} }),
      siteUrl: "https://ugo.test",
      marketFeePct: 10,
    },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: OPERATOR,
      gosini: { dataKey: MASTER },
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
  await stripe.close();
});

const call = (method: "GET" | "POST", url: string, who: string, payload?: unknown) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${who}` }, ...(payload !== undefined && { payload: payload as object }) });

const stripeEvent = (id: string, type: string, object: Record<string, unknown>) => {
  const body = JSON.stringify({ id, type, data: { object } });
  return app.inject({
    method: "POST",
    url: "/webhooks/stripe",
    headers: { "content-type": "application/json", "stripe-signature": signStripePayload(body, WHSEC, Math.floor(Date.now() / 1000)) },
    payload: body,
  });
};

let acct = "";

describe("il conto dell'allevamento", () => {
  it("senza conto si cede gratis, ma non si vende", async () => {
    expect((await call("GET", "/v1/allevamento/pagamenti", breederToken)).json()).toMatchObject({ conto: null });
    const paid = await call("POST", `/v1/gosini/${cub}/vetrina`, breederToken, { listed: true, priceCents: 3000 });
    expect(paid.statusCode).toBe(409);
    const free = await call("POST", `/v1/gosini/${cub}/vetrina`, breederToken, { listed: true, priceCents: 0 });
    expect(free.statusCode).toBe(200);
    await call("POST", `/v1/gosini/${cub}/vetrina`, breederToken, { listed: false });
  });

  it("si apre presso Stripe, che verifica; noi teniamo solo l'id e lo stato", async () => {
    const res = await call("POST", "/v1/allevamento/pagamenti", breederToken);
    expect(res.json<{ url: string }>().url).toContain("connect.stripe.test/onboarding/acct_");
    expect(stripe.last("/v1/accounts")?.form).toMatchObject({
      type: "express",
      country: "IT",
      "metadata[account_id]": breeder,
    });
    const [row] = await db.select().from(breederPayoutAccounts).where(eq(breederPayoutAccounts.accountId, breeder));
    acct = row?.stripeAccountId ?? "";
    expect(row?.chargesEnabled).toBe(false);
    // una famiglia non apre conti d'allevamento
    expect((await call("POST", "/v1/allevamento/pagamenti", buyerToken)).statusCode).toBe(403);
  });

  it("il webhook dice quando incassa, e da lì si vende", async () => {
    await stripeEvent("evt_acct", "account.updated", {
      id: acct,
      charges_enabled: true,
      payouts_enabled: true,
      requirements: { currently_due: [] },
      metadata: { account_id: breeder },
    });
    expect((await call("GET", "/v1/allevamento/pagamenti", breederToken)).json()).toMatchObject({
      conto: { incassa: true, versamenti: true, mancano: 0 },
    });
    const listed = await call("POST", `/v1/gosini/${cub}/vetrina`, breederToken, { listed: true, priceCents: 3000 });
    expect(listed.statusCode).toBe(200);
    const dash = await call("POST", "/v1/allevamento/pagamenti/dashboard", breederToken);
    expect(dash.json<{ url: string }>().url).toContain(`express/${acct}`);
  });
});

describe("la vetrina pubblica", () => {
  it("si filtra per allevamento e per prezzo", async () => {
    const byKennel = await app.inject({ method: "GET", url: "/v1/vetrina?allevamento=allevamento-rosa" });
    expect(byKennel.json<{ allevamenti: { slug: string }[] }>().allevamenti.map((k) => k.slug)).toEqual([
      "allevamento-rosa",
    ]);
    const cheap = await app.inject({ method: "GET", url: "/v1/vetrina?prezzoMax=1000" });
    expect(cheap.json<{ allevamenti: unknown[] }>().allevamenti).toHaveLength(0);
  });
});

describe("la vendita con Connect", () => {
  let adoption = "";

  it("i soldi vanno all'allevatore, la commissione a noi", async () => {
    const booked = await call("POST", `/v1/vetrina/${cub}/prenota`, buyerToken, {});
    expect(booked.statusCode).toBe(201);
    adoption = booked.json<{ adozione: string }>().adozione;
    // PayPal multiparty non c'è: con un allevamento si paga con la carta
    expect((await call("POST", `/v1/adozioni/${adoption}/checkout`, buyerToken, { via: "paypal" })).statusCode).toBe(409);
    const checkout = await call("POST", `/v1/adozioni/${adoption}/checkout`, buyerToken, { via: "stripe" });
    expect(checkout.statusCode).toBe(200);
    expect(stripe.last("/v1/checkout/sessions")?.form).toMatchObject({
      "line_items[0][price_data][unit_amount]": "3000",
      "payment_intent_data[transfer_data][destination]": acct,
      "payment_intent_data[application_fee_amount]": "300",
    });
  });

  it("pagata dal webhook; annullata dall'allevamento, rimborsata con lo storno", async () => {
    await stripeEvent("evt_pay", "payment_intent.succeeded", {
      id: "pi_vendita",
      amount_received: 3000,
      metadata: { account_id: buyer, purpose: "adoption", ref: adoption },
    });
    const [paid] = await db.select().from(adoptions).where(eq(adoptions.id, adoption));
    // non è la fonderia: si consegna a mano
    expect(paid?.status).toBe("pagata");
    const cancelled = await call("POST", `/v1/adozioni/${adoption}/annulla`, breederToken, {});
    expect(cancelled.json()).toMatchObject({ status: "annullata", rimborsata: true });
    expect(stripe.last("/v1/refunds")?.form).toMatchObject({
      payment_intent: "pi_vendita",
      reverse_transfer: "true",
      refund_application_fee: "true",
    });
    const [back] = await db.select().from(gosini).where(eq(gosini.id, cub));
    expect(back?.listedAt).not.toBeNull();
  });
});

describe("le segnalazioni", () => {
  it("chi guarda segnala, l'allevamento non sa chi, l'operatore sospende", async () => {
    const sent = await call("POST", `/v1/vetrina/${cub}/segnala`, buyerToken, { motivo: "ingannevole", nota: "foto non sua" });
    expect(sent.statusCode).toBe(201);
    expect((await call("GET", "/v1/operatore/segnalazioni", breederToken)).statusCode).toBe(403);
    const list = await call("GET", "/v1/operatore/segnalazioni", OPERATOR);
    const [report] = list.json<{ segnalazioni: { id: string; motivo: string }[] }>().segnalazioni;
    expect(report?.motivo).toBe("ingannevole");
    expect((await call("POST", `/v1/operatore/segnalazioni/${report?.id ?? ""}`, OPERATOR, { azione: "sospendi" })).statusCode).toBe(200);
    const [hidden] = await db.select().from(gosini).where(eq(gosini.id, cub));
    expect(hidden?.listedAt).toBeNull();
    const [row] = await db.select().from(listingReports);
    expect(row?.status).toBe("sospeso");
  });
});
