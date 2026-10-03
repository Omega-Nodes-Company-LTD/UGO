import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accountLogins,
  accounts,
  adoptions,
  createDbClient,
  creditLedger,
  creditSettings,
  gosini,
  runMigrations,
  subscriptions,
  traitSets,
  type DbClient,
} from "@ugo/db";
import type {
  PayPalStub,
  ResendStub} from "@ugo/factories";
import {
  startPayPalStub,
  startPostgres,
  startResendStub,
  startStripeStub,
  type StripeStub,
} from "@ugo/factories";
import { encryptText, generateDataKey, signStripePayload, unwrapDataKey } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { createAccount, createAccountWithFounder } from "../../src/services/accountService.js";
import { ResendMailer } from "../../src/services/auth/mailer.js";
import { PayPalClient } from "../../src/services/billing/paypal.js";
import { PlanGate } from "../../src/services/billing/plan.js";
import { maybeRecharge, type RechargeDeps } from "../../src/services/billing/recharge.js";
import { StripeClient } from "../../src/services/billing/stripe.js";

/**
 * ADR-125/126/130: piani, abbonamenti, credito, adozioni a pagamento.
 * Postgres vero; Stripe, PayPal e Resend su stub di rete veri; i webhook
 * firmati con la stessa funzione che la rotta usa per verificarli.
 */

const MASTER = generateDataKey();
const WHSEC = "whsec_prova";
const SITE = "https://ugo.test";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let stripeStub: StripeStub;
let paypalStub: PayPalStub;
let resend: ResendStub;
let app: FastifyInstance;
let recharge: RechargeDeps;
let house = "";
let token = "";

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  [stripeStub, paypalStub, resend] = await Promise.all([startStripeStub(), startPayPalStub(), startResendStub()]);
  const stripe = new StripeClient({
    secretKey: "sk_test_prova",
    webhookSecret: WHSEC,
    apiBase: stripeStub.baseUrl,
    prices: { pro: "price_pro", allevamento: "price_allevamento" },
  });
  const paypal = new PayPalClient({
    clientId: "client",
    clientSecret: "secret",
    webhookId: "WH-1",
    apiBase: paypalStub.baseUrl,
    plans: { pro: "P-PRO", allevamento: "P-ALL" },
  });
  const mailer = new ResendMailer({ apiKey: "re_test", from: "UGO <ugo@ugo.test>", baseUrl: resend.baseUrl });
  recharge = { db, masterKey: MASTER, stripe, paypal, mailer, siteUrl: SITE };

  const born = await createAccountWithFounder(db, MASTER, { slug: "casa-che-paga", name: "Casa", gosinoName: "Ugo" });
  house = born.accountId;
  token = born.ownerToken;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    billing: { plans: new PlanGate("free"), masterKey: MASTER, stripe, paypal, mailer, siteUrl: SITE },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: { dataKey: MASTER },
      tts: () => Promise.resolve({ audio: Buffer.from("ID3voce"), mime: "audio/mpeg" }),
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
  await Promise.all([stripeStub.close(), paypalStub.close(), resend.close()]);
});

const as = (who: string) => ({ authorization: `Bearer ${who}` });
const call = (method: "GET" | "POST" | "PUT", url: string, payload?: unknown, who = token) =>
  app.inject({ method, url, headers: as(who), ...(payload !== undefined && { payload: payload as object }) });

const stripeEvent = (id: string, type: string, object: Record<string, unknown>) => {
  const body = JSON.stringify({ id, type, data: { object } });
  return app.inject({
    method: "POST",
    url: "/webhooks/stripe",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signStripePayload(body, WHSEC, Math.floor(Date.now() / 1000)),
    },
    payload: body,
  });
};

const paypalEvent = (id: string, eventType: string, resource: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/webhooks/paypal",
    headers: { "content-type": "application/json", "paypal-transmission-id": "t-1" },
    payload: JSON.stringify({ id, event_type: eventType, resource }),
  });

const balance = async (account: string): Promise<number> =>
  (await db.select().from(creditLedger).where(eq(creditLedger.accountId, account))).reduce(
    (sum, row) => sum + row.amountMicros,
    0,
  );

describe("il piano free", () => {
  it("si vede, e dice cosa sblocca", async () => {
    const res = await call("GET", "/v1/abbonamento");
    expect(res.json()).toMatchObject({ piano: "free", abbonamento: null, vie: { stripe: true, paypal: true } });
    expect((await call("GET", "/v1/me")).json()).toMatchObject({ piano: { id: "free", capacita: { voice: false } } });
  });

  it("non ha la voce sintetica (204: il muso usa la sua) e ha una stanza sola", async () => {
    expect((await call("POST", "/v1/tts", { text: "ciao" })).statusCode).toBe(204);
    expect((await call("POST", "/v1/rooms", { name: "cucina" })).statusCode).toBe(201);
    const second = await call("POST", "/v1/rooms", { name: "salotto" });
    expect(second.statusCode).toBe(402);
    expect(second.json()).toMatchObject({ capacita: "rooms" });
    expect((await call("POST", "/v1/jobs/dream", {})).statusCode).toBe(402);
  });
});

describe("l'abbonamento con Stripe", () => {
  it("il checkout porta piano e casa nei metadati", async () => {
    const res = await call("POST", "/v1/abbonamento/checkout", { piano: "pro", via: "stripe" });
    expect(res.json<{ url: string }>().url).toContain("checkout.stripe.test");
    const sent = stripeStub.last("/v1/checkout/sessions");
    expect(sent?.form).toMatchObject({
      mode: "subscription",
      "line_items[0][price]": "price_pro",
      "metadata[account_id]": house,
      "subscription_data[metadata][plan]": "pro",
    });
    expect(sent?.authorization).toBe("Bearer sk_test_prova");
    // il ritorno dal checkout non cambia niente: lo fa solo il webhook
    expect((await call("GET", "/v1/abbonamento")).json()).toMatchObject({ piano: "free" });
  });

  it("una firma sbagliata non entra", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=00" },
      payload: JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("il webhook accende il piano, e la voce arriva", async () => {
    const object = {
      mode: "subscription",
      subscription: "sub_1",
      customer: "cus_1",
      metadata: { account_id: house, purpose: "subscription", plan: "pro" },
    };
    expect((await stripeEvent("evt_1", "checkout.session.completed", object)).statusCode).toBe(200);
    // lo stesso evento due volte è un evento solo
    expect((await stripeEvent("evt_1", "checkout.session.completed", object)).statusCode).toBe(200);
    expect((await call("GET", "/v1/abbonamento")).json()).toMatchObject({ piano: "pro", fonte: "abbonamento" });
    const voice = await call("POST", "/v1/tts", { text: "ciao" });
    expect(voice.statusCode).toBe(200);
    expect((await call("POST", "/v1/rooms", { name: "salotto" })).statusCode).toBe(201);
  });

  it("disdetto, torna free ma non perde niente (ADR-125 §6)", async () => {
    await stripeEvent("evt_2", "customer.subscription.deleted", {
      id: "sub_1",
      customer: "cus_1",
      status: "canceled",
      metadata: { account_id: house, purpose: "subscription", plan: "pro" },
    });
    expect((await call("GET", "/v1/abbonamento")).json()).toMatchObject({ piano: "free" });
    expect((await call("POST", "/v1/tts", { text: "ciao" })).statusCode).toBe(204);
    // le due stanze restano; una terza no
    expect((await call("POST", "/v1/rooms", { name: "camera" })).statusCode).toBe(402);
  });
});

describe("il credito", () => {
  it("la ricarica apre il pagamento e salva il metodo; il credito arriva dal webhook", async () => {
    const res = await call("POST", "/v1/credito/ricarica", { euro: 10, via: "stripe" });
    expect(res.statusCode).toBe(200);
    expect(stripeStub.last("/v1/checkout/sessions")?.form).toMatchObject({
      mode: "payment",
      "line_items[0][price_data][unit_amount]": "1000",
      "payment_intent_data[setup_future_usage]": "off_session",
      "payment_intent_data[metadata][purpose]": "topup",
    });
    expect(await balance(house)).toBe(0);
    await stripeEvent("evt_3", "payment_intent.succeeded", {
      id: "pi_topup",
      amount_received: 1000,
      customer: "cus_1",
      payment_method: "pm_1",
      metadata: { account_id: house, purpose: "topup" },
    });
    expect(await balance(house)).toBe(10_000_000);
    const [settings] = await db.select().from(creditSettings).where(eq(creditSettings.accountId, house));
    expect(settings?.provider).toBe("stripe");
    expect(settings?.paymentMethodEnc).not.toContain("pm_1");
  });

  it("la ricarica automatica parte sotto soglia, una volta, e si accredita col webhook", async () => {
    const set = await call("PUT", "/v1/credito/impostazioni", {
      automatica: true,
      sogliaEuro: 20,
      importoEuro: 15,
      tettoMeseEuro: 50,
    });
    expect(set.statusCode).toBe(200);
    expect(await maybeRecharge(recharge, house)).toBe("started");
    const charge = stripeStub.last("/v1/payment_intents");
    expect(charge?.form).toMatchObject({
      amount: "1500",
      customer: "cus_1",
      payment_method: "pm_1",
      off_session: "true",
      "metadata[purpose]": "recharge",
    });
    expect(charge?.idempotencyKey).toContain(house);
    // finché il webhook non arriva, non se ne parte un'altra
    expect(await maybeRecharge(recharge, house)).toBe("none");
    await stripeEvent("evt_4", "payment_intent.succeeded", {
      id: "pi_auto",
      amount_received: 1500,
      metadata: { account_id: house, purpose: "recharge" },
    });
    expect(await balance(house)).toBe(25_000_000);
    const auto = await db.select().from(creditLedger).where(eq(creditLedger.ref, "auto:stripe:pi_auto"));
    expect(auto).toHaveLength(1);
  });

  it("al primo rifiuto si spegne e lo dice per mail", async () => {
    // chi entra in casa ha un'email (ADR-124), cifrata con la DEK della casa
    const [row] = await db.select().from(accounts).where(eq(accounts.id, house));
    const dek = unwrapDataKey(row?.wrappedDataKey ?? Buffer.alloc(0), MASTER);
    await db.insert(accountLogins).values({
      accountId: house,
      emailHash: "hash-di-prova",
      emailEnc: encryptText("anna@example.it", dek),
      consentedAt: new Date(),
      termsVersion: "2026-10-02",
    });
    // il saldo deve tornare sotto soglia: un consumo
    await db.insert(creditLedger).values({ accountId: house, kind: "usage", amountMicros: -20_000_000 });
    stripeStub.declineNext = "authentication_required";
    expect(await maybeRecharge(recharge, house)).toBe("failed");
    const [settings] = await db.select().from(creditSettings).where(eq(creditSettings.accountId, house));
    expect(settings).toMatchObject({ autoRecharge: false, disabledReason: "authentication_required" });
    expect(resend.lastTo("anna@example.it")?.subject).toContain("ricarica automatica");
    // riaccenderla è la risposta
    await call("PUT", "/v1/credito/impostazioni", { automatica: true, sogliaEuro: 2, importoEuro: 10, tettoMeseEuro: 50 });
    expect((await call("GET", "/v1/credito")).json()).toMatchObject({ automatica: { attiva: true, spenta: null } });
  });
});

describe("PayPal", () => {
  it("l'abbonamento si attiva solo da un webhook verificato", async () => {
    const res = await call("POST", "/v1/abbonamento/checkout", { piano: "pro", via: "paypal" });
    expect(res.json<{ url: string }>().url).toContain("paypal.test/approve");
    expect(paypalStub.last("/v1/billing/subscriptions")?.body).toMatchObject({
      plan_id: "P-PRO",
      custom_id: `subscription:${house}`,
    });
    const resource = { id: "I-9", plan_id: "P-PRO", status: "ACTIVE", custom_id: `subscription:${house}` };
    paypalStub.verifies = false;
    expect((await paypalEvent("WH-EV-1", "BILLING.SUBSCRIPTION.ACTIVATED", resource)).statusCode).toBe(400);
    paypalStub.verifies = true;
    expect((await paypalEvent("WH-EV-2", "BILLING.SUBSCRIPTION.ACTIVATED", resource)).statusCode).toBe(200);
    expect((await call("GET", "/v1/abbonamento")).json()).toMatchObject({ piano: "pro" });
  });

  it("la ricarica: approvazione, incasso al ritorno (col vault), credito dal webhook", async () => {
    const before = await balance(house);
    const res = await call("POST", "/v1/credito/ricarica", { euro: 5, via: "paypal" });
    const order = res.json<{ url: string }>().url.split("/").at(-1) ?? "";
    const back = await app.inject({ method: "GET", url: `/pagamenti/paypal/ritorno?token=${order}` });
    expect(back.statusCode).toBe(303);
    const [settings] = await db.select().from(creditSettings).where(eq(creditSettings.accountId, house));
    expect(settings?.provider).toBe("paypal");
    expect(await balance(house)).toBe(before);
    await paypalEvent("WH-EV-3", "PAYMENT.CAPTURE.COMPLETED", {
      id: "CAP-9",
      amount: { value: "5.00", currency_code: "EUR" },
      custom_id: `topup:${house}`,
    });
    expect(await balance(house)).toBe(before + 5_000_000);
  });
});

describe("l'adozione a pagamento (ADR-126, ADR-128)", () => {
  let kennel = "";
  let buyer = "";
  let buyerToken = "";

  const listCub = async (name: string, priceCents: number): Promise<string> => {
    const [cub] = await db
      .insert(gosini)
      .values({ accountId: kennel, name, origin: "nato", generation: 1, listedAt: new Date(), priceCents })
      .returning({ id: gosini.id });
    if (cub === undefined) throw new Error("no cub");
    await db.insert(traitSets).values({ accountId: kennel, gosinoId: cub.id, version: 1, traits: { calm: 0.5 } });
    return cub.id;
  };

  beforeAll(async () => {
    const foundry = await createAccountWithFounder(db, MASTER, {
      slug: "fonderia",
      name: "Fonderia",
      gosinoName: "Primo",
      foundry: true,
      breeder: true,
    });
    kennel = foundry.accountId;
    await db.update(accounts).set({ autoDeliver: true }).where(eq(accounts.id, kennel));
    const family = await createAccount(db, MASTER, { slug: "famiglia", name: "Famiglia" });
    buyer = family.accountId;
    buyerToken = family.ownerToken;
  });

  it("il cucciolo gratuito della fonderia arriva subito a casa", async () => {
    const cub = await listCub("Regalo", 0);
    const res = await call("POST", `/v1/vetrina/${cub}/prenota`, {}, buyerToken);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ stato: "consegnata" });
    const [moved] = await db.select().from(gosini).where(eq(gosini.id, cub));
    expect(moved?.accountId).toBe(buyer);
  });

  it("free vuol dire un gosino: il secondo chiede il piano", async () => {
    const cub = await listCub("Secondo", 2500);
    const res = await call("POST", `/v1/vetrina/${cub}/prenota`, {}, buyerToken);
    expect(res.statusCode).toBe(402);
  });

  it("col piano giusto si prenota, si paga con Stripe e la fonderia consegna", async () => {
    await db.update(accounts).set({ planGrant: "pro" }).where(eq(accounts.id, buyer));
    const cub = await listCub("Terzo", 2500);
    const booked = await call("POST", `/v1/vetrina/${cub}/prenota`, {}, buyerToken);
    expect(booked.statusCode).toBe(201);
    const adoption = booked.json<{ adozione: string }>().adozione;
    const checkout = await call("POST", `/v1/adozioni/${adoption}/checkout`, { via: "stripe" }, buyerToken);
    expect(checkout.statusCode).toBe(200);
    expect(stripeStub.last("/v1/checkout/sessions")?.form).toMatchObject({
      "line_items[0][price_data][unit_amount]": "2500",
      "payment_intent_data[metadata][purpose]": "adoption",
      "payment_intent_data[metadata][ref]": adoption,
    });
    // un altro non paga la pratica di questa famiglia
    expect((await call("POST", `/v1/adozioni/${adoption}/checkout`, { via: "stripe" })).statusCode).toBe(404);
    await stripeEvent("evt_adopt", "payment_intent.succeeded", {
      id: "pi_adopt",
      amount_received: 2500,
      metadata: { account_id: buyer, purpose: "adoption", ref: adoption },
    });
    const [row] = await db.select().from(adoptions).where(eq(adoptions.id, adoption));
    expect(row).toMatchObject({ status: "consegnata", paymentRef: "stripe:pi_adopt", paymentProvider: "stripe" });
  });

  it("l'abbonamento della famiglia resta suo", async () => {
    expect(await db.select().from(subscriptions).where(eq(subscriptions.accountId, buyer))).toHaveLength(0);
  });
});
