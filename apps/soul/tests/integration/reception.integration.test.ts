import { randomBytes } from "node:crypto";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  auditLog,
  budgetLedger,
  createDbClient,
  customerGosini,
  customerMessages,
  customerRewards,
  customers,
  events,
  tickets,
  type DbClient,
  runMigrations,
} from "@ugo/db";
import { cachedPrefix, DEFAULT_CHAT_MODEL, LlmClient } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { openRouterKey, startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  issueCustomerToken,
  revokeCustomerToken,
} from "../../src/services/reception/customerAuth.js";
import { CUSTOMER_BUDGET_REPLY } from "../../src/services/reception/customerChatService.js";
import { CustomerQuota } from "../../src/services/reception/customerQuota.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * The reception over the real HTTP stack (ADR-051/052/055): dual credential,
 * anti-BOLA 404s, the two cost walls, encryption at rest, and the prompt-cache
 * discipline — cached blocks identical across different customers.
 *
 * Il modello è quello VERO, su OpenRouter (ADR-125). Ciò che prima si leggeva
 * nella richiesta catturata si verifica dal comportamento: la risposta, le
 * righe del ledger, la cache letta dal fornitore.
 */

const RECEPTION_TOKEN = "reception-service-secret";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;

let houseA: TestHouse;
let houseB: TestHouse;
let customerA: { id: string; token: string };
let customerB: { id: string; token: string };

async function addCustomer(
  house: TestHouse,
  slug: string,
  overrides: {
    hourlyMessageLimit?: number;
    dailyBudgetUsd?: string;
    weeklyRewardLimit?: number;
  } = {},
): Promise<{ id: string; token: string }> {
  const [row] = await db
    .insert(customers)
    .values({ accountId: house.id, name: slug, slug, ...overrides })
    .returning({ id: customers.id });
  if (row === undefined) throw new Error("customer not created");
  await db
    .insert(customerGosini)
    .values({ accountId: house.id, customerId: row.id, gosinoId: house.gosinoId });
  const issued = await issueCustomerToken(db, {
    accountId: house.id,
    customerId: row.id,
    label: `portale ${slug}`,
  });
  return { id: row.id, token: issued.token };
}

/** quante chiamate pagate ha fatto una casa: chi chiama OpenRouter scrive una riga */
async function providerCalls(accountId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(budgetLedger)
    .where(and(eq(budgetLedger.accountId, accountId), eq(budgetLedger.provider, "openrouter")));
  return Number(row?.count ?? 0);
}

function receptionHeaders(customerToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${RECEPTION_TOKEN}`,
    "x-reception-customer": customerToken,
  };
}

beforeAll(async () => {
  const postgres = await startPostgres();
  pg = postgres.container;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);

  houseA = await createHouse(db, "casa-reception-a");
  houseB = await createHouse(db, "casa-reception-b");
  customerA = await addCustomer(houseA, "rossi-srl");
  customerB = await addCustomer(houseB, "bianchi-spa");

  const llmFor = (
    accountId: string,
    gosinoId: string,
    clock?: { timezone: string; locale: string },
  ): LlmClient =>
    new LlmClient({
      db,
      apiKey: openRouterKey(),
      model: DEFAULT_CHAT_MODEL,
      dailyBudgetUsd: 10,
      accountId,
      gosinoId,
      timezone: clock?.timezone ?? "Europe/Rome",
      locale: clock?.locale ?? "it-IT",
    });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      reception: {
        token: RECEPTION_TOKEN,
        dataKey,
        weeklyRewards: 2,
        quota: new CustomerQuota(db, {
          hourlyMessages: 100,
          dailyBudgetUsd: 5,
          timezone: "Europe/Rome",
        }),
        llmFor,
      },
    },
  });
});

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("the reception's double credential", () => {
  it("refuses a customer token without the service token, and audits it", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: { "x-reception-customer": customerA.token },
    });
    expect(response.statusCode).toBe(401);
    const denied = await db.select().from(auditLog).where(eq(auditLog.verb, "denied"));
    expect(denied.some((row) => row.resourceId === "/v1/reception/me")).toBe(true);
  });

  it("refuses the service token without a valid customer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: receptionHeaders("not-a-real-token"),
    });
    expect(response.statusCode).toBe(401);
  });

  it("a family bearer token does not open the reception", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: {
        authorization: `Bearer ${RECEPTION_TOKEN}`,
        "x-reception-customer": RECEPTION_TOKEN,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("a revoked customer token stops working", async () => {
    const revocable = await issueCustomerToken(db, {
      accountId: houseA.id,
      customerId: customerA.id,
      label: "da revocare",
    });
    const before = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: receptionHeaders(revocable.token),
    });
    expect(before.statusCode).toBe(200);
    expect(await revokeCustomerToken(db, revocable.id)).toBe(true);
    const after = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: receptionHeaders(revocable.token),
    });
    expect(after.statusCode).toBe(401);
  });
});

describe("who am I", () => {
  it("shows the customer and only their assigned gosini", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: receptionHeaders(customerA.token),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ customer: { id: string }; gosini: { id: string }[] }>();
    expect(body.customer.id).toBe(customerA.id);
    expect(body.gosini.map((gosino) => gosino.id)).toEqual([houseA.gosinoId]);
  });
});

describe("the conversation", () => {
  it("answers through the real model and persists both turns encrypted", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseA.gosinoId, text: "Dove sta la funzione di avvio?" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ reply: string; degraded: boolean }>();
    expect(body.reply.length).toBeGreaterThan(0);
    expect(body.degraded).toBe(false);

    const rows = await db
      .select()
      .from(customerMessages)
      .where(eq(customerMessages.customerId, customerA.id));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.text.startsWith("v1:")).toBe(true);
    }
    const texts = rows.map((row) => decryptText(row.text, dataKey));
    expect(texts).toContain("Dove sta la funzione di avvio?");
  });

  it("keeps the cached blocks identical across different customers (rule 2)", async () => {
    // le regole della reception stanno nel prefisso del canale ticket, e il
    // prefisso dipende SOLO da canale e lingua: nessun dato del cliente
    expect(cachedPrefix("ticket", "it-IT")).toContain("reception");
    await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseA.gosinoId, text: "Com'è lo stato dei lavori?" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerB.token),
      payload: { gosinoId: houseB.gosinoId, text: "A che punto siamo?" },
    });
    // la prova che il prefisso è lo stesso byte per byte la dà il fornitore:
    // il cliente B, di un'altra casa, legge dalla cache ciò che A ha scritto
    const [ofB] = await db
      .select({ cacheRead: budgetLedger.tokensCacheRead })
      .from(budgetLedger)
      .where(eq(budgetLedger.accountId, houseB.id));
    expect(ofB?.cacheRead ?? 0).toBeGreaterThan(0);
  });

  it("answers 404 for a gosino of another house (anti-BOLA)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseB.gosinoId, text: "Ciao" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("«a che punto siamo» senza GitHub pesca il digest del sogno, con la data", async () => {
    // gruppo 11: questa build non ha l'adapter GitHub — esattamente il freddo
    // in cui il digest pre-calcolato è l'unico stato che la reception ha
    await db
      .update(customers)
      .set({
        digest: encryptText("Ticket aperti: 2.\nRepo negozio: ultimo commit abc1234 (ok).", dataKey),
        digestAt: new Date("2026-08-15T02:30:00Z"),
      })
      .where(eq(customers.id, customerA.id));
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: {
        gosinoId: houseA.gosinoId,
        // la domanda resta quella che accende il digest, e chiede un fatto
        // che solo il digest contiene: un modello vero sceglie da sé cosa
        // citare, e «a che punto siamo» da solo lo lasciava libero di tacerlo
        text: "A che punto siamo con i lavori? Quanti ticket aperti ci sono e qual è l'ultimo commit?",
      },
    });
    expect(response.statusCode).toBe(200);
    // il digest è arrivato al modello: risponde con un fatto che c'è scritto solo lì
    const reply = response.json<{ reply: string }>().reply.toLowerCase();
    expect(/abc1234|\b2 ticket|\bdue ticket/u.test(reply)).toBe(true);
    // e resta un ripiego: il ciphertext non entra mai nel prompt
    expect(reply).not.toContain("v1:");
  });
});

describe("the two cost walls (ADR-055)", () => {
  it("returns a courteous 429 past the hourly quota, persisting nothing", async () => {
    const limited = await addCustomer(houseA, "limitato-srl", { hourlyMessageLimit: 1 });
    const callsBefore = await providerCalls(houseA.id);
    const first = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(limited.token),
      payload: { gosinoId: houseA.gosinoId, text: "Prima domanda" },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(limited.token),
      payload: { gosinoId: houseA.gosinoId, text: "Seconda domanda" },
    });
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBeDefined();
    // the refused knock did not tighten the quota
    const rows = await db
      .select()
      .from(customerMessages)
      .where(eq(customerMessages.customerId, limited.id));
    expect(rows).toHaveLength(2); // the first exchange only
    expect(await providerCalls(houseA.id)).toBe(callsBefore + 1);
  });

  it("degrades in the gosino's voice past the daily budget, without the provider", async () => {
    // numeric(10,4): the smallest representable non-zero cap
    const poor = await addCustomer(houseA, "povero-srl", { dailyBudgetUsd: "0.0001" });
    // la giornata del cliente è già spesa: una risposta di oggi costata più del
    // tetto (il muro somma `customer_messages.cost_usd` del giorno della casa)
    await db.insert(customerMessages).values({
      accountId: houseA.id,
      customerId: poor.id,
      gosinoId: houseA.gosinoId,
      role: "assistant",
      text: encryptText("una risposta già pagata", dataKey),
      costUsd: "0.010000",
    });
    const callsBefore = await providerCalls(houseA.id);

    const second = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(poor.token),
      payload: { gosinoId: houseA.gosinoId, text: "Seconda domanda" },
    });
    expect(second.statusCode).toBe(200);
    const body = second.json<{ reply: string; degraded: boolean }>();
    expect(body.degraded).toBe(true);
    expect(body.reply).toBe(CUSTOMER_BUDGET_REPLY);
    expect(await providerCalls(houseA.id)).toBe(callsBefore); // the provider was not called
  });
});

describe("le guide in PDF", () => {
  it("«fammi una guida» istruisce il modello nel dinamico e marca la risposta", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: {
        gosinoId: houseA.gosinoId,
        text: "Fammi una guida: nell'app X come imposto il titolo?",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ reply: string; guide?: boolean }>();
    expect(body.guide).toBe(true);
    // il modello ha ricevuto l'istruzione: risponde a passi numerati
    expect(body.reply).toMatch(/^\s*1\./m);
    expect(body.reply).toMatch(/^\s*2\./m);
    // l'istruzione della guida vive nel blocco DINAMICO: il prefisso cached
    // non cambia di un byte (regola 2)
    expect(cachedPrefix("ticket", "it-IT")).not.toContain("GUIDA");
  });

  it("una domanda normale non è una guida, e non porta l'istruzione", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseA.gosinoId, text: "Dove sta la configurazione del logger?" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ guide?: boolean }>().guide).toBeUndefined();
  });

  it("il PDF arriva come allegato vero, con la doppia credenziale", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/guide-pdf",
      headers: receptionHeaders(customerA.token),
      payload: { text: "Titolo di prova\n1. Fai la cosa.\n2. Verifica → fatto." },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("guida.pdf");
    expect(response.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("senza il token del cliente il PDF non esiste", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/guide-pdf",
      headers: { authorization: `Bearer ${RECEPTION_TOKEN}` },
      payload: { text: "x" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("the tickets", () => {
  it("collects 'apri un ticket' deterministically: zero provider tokens", async () => {
    const callsBefore = await providerCalls(houseA.id);
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: receptionHeaders(customerA.token),
      payload: {
        gosinoId: houseA.gosinoId,
        text: "Apri un ticket: vorrei il bottone di export in CSV",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ ticketId?: string }>();
    expect(body.ticketId).toBeDefined();
    expect(await providerCalls(houseA.id)).toBe(callsBefore);

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, body.ticketId ?? ""));
    expect(ticket).toBeDefined();
    expect(ticket?.title.startsWith("v1:")).toBe(true);
    expect(decryptText(ticket?.body ?? "", dataKey)).toContain("export in CSV");

    const audited = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.verb, "ticket_created"), eq(auditLog.resourceId, ticket?.id ?? "")));
    expect(audited).toHaveLength(1);
  });

  it("creates, lists and reopens tickets — and hides them from other customers", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/reception/tickets",
      headers: receptionHeaders(customerA.token),
      payload: {
        gosinoId: houseA.gosinoId,
        title: "Cambiare il logo",
        body: "Il logo nuovo arriva la settimana prossima",
      },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();

    const listed = await app.inject({
      method: "GET",
      url: "/v1/reception/tickets",
      headers: receptionHeaders(customerA.token),
    });
    const { tickets: list } = listed.json<{ tickets: { id: string; title: string }[] }>();
    expect(list.some((ticket) => ticket.id === id && ticket.title === "Cambiare il logo")).toBe(
      true,
    );

    // another customer's ticket answers 404, never 403
    const foreign = await app.inject({
      method: "GET",
      url: `/v1/reception/tickets/${id}`,
      headers: receptionHeaders(customerB.token),
    });
    expect(foreign.statusCode).toBe(404);

    // closing from the house side, then a reply reopens to `waiting`
    await db.update(tickets).set({ status: "closed", closedAt: new Date() }).where(eq(tickets.id, id));
    const reply = await app.inject({
      method: "POST",
      url: `/v1/reception/tickets/${id}/reply`,
      headers: receptionHeaders(customerA.token),
      payload: { text: "In realtà il logo è pronto, lo allego domani" },
    });
    expect(reply.statusCode).toBe(204);
    const [reopened] = await db.select().from(tickets).where(eq(tickets.id, id));
    expect(reopened?.status).toBe("waiting");
    expect(reopened?.closedAt).toBeNull();
  });
});

describe("la mela del cliente (ADR-058)", () => {
  it("arriva con l'identità: /me dice quante ne restano", async () => {
    const fresh = await addCustomer(houseA, "verdi-sas");
    const response = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: receptionHeaders(fresh.token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ rewards: unknown }>().rewards).toEqual({
      weeklyLimit: 2,
      remaining: 2,
    });
  });

  it("una mela conta, resta scritta, arriva alla memoria episodica e all'audit", async () => {
    const given = await app.inject({
      method: "POST",
      url: "/v1/reception/reward",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseA.gosinoId },
    });
    expect(given.statusCode).toBe(201);
    expect(given.json<{ rewards: { remaining: number } }>().rewards.remaining).toBe(1);

    const rows = await db
      .select()
      .from(customerRewards)
      .where(eq(customerRewards.customerId, customerA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.accountId).toBe(houseA.id);

    // la riga in `events`: source reception, solo ID nel payload (regola 6)
    const remembered = await db
      .select()
      .from(events)
      .where(and(eq(events.gosinoId, houseA.gosinoId), eq(events.type, "reward")));
    expect(remembered.some((row) => row.source === "reception")).toBe(true);
    const payload = remembered.find((row) => row.source === "reception")?.payload as {
      customer?: string;
    };
    expect(payload.customer).toBe(customerA.id);

    const audited = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.verb, "customer_reward_given"));
    expect(audited.some((row) => row.resourceId === houseA.gosinoId)).toBe(true);
  });

  it("il muro: finite le mele risponde 429 con quando torna la prossima, e non scrive", async () => {
    const second = await app.inject({
      method: "POST",
      url: "/v1/reception/reward",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseA.gosinoId },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json<{ rewards: { remaining: number } }>().rewards.remaining).toBe(0);

    const third = await app.inject({
      method: "POST",
      url: "/v1/reception/reward",
      headers: receptionHeaders(customerA.token),
      payload: { gosinoId: houseA.gosinoId },
    });
    expect(third.statusCode).toBe(429);
    expect(third.json<{ nextAt?: string }>().nextAt).toBeDefined();

    const rows = await db
      .select()
      .from(customerRewards)
      .where(eq(customerRewards.customerId, customerA.id));
    expect(rows).toHaveLength(2);
  });

  it("la finestra è mobile: una mela di otto giorni fa non conta più", async () => {
    const [oldest] = await db
      .select({ id: customerRewards.id })
      .from(customerRewards)
      .where(eq(customerRewards.customerId, customerA.id))
      .limit(1);
    if (oldest === undefined) throw new Error("no reward to backdate");
    await db
      .update(customerRewards)
      .set({ ts: new Date(Date.now() - 8 * 24 * 60 * 60_000) })
      .where(eq(customerRewards.id, oldest.id));

    const response = await app.inject({
      method: "GET",
      url: "/v1/reception/me",
      headers: receptionHeaders(customerA.token),
    });
    expect(response.json<{ rewards: { remaining: number } }>().rewards.remaining).toBe(1);
  });

  it("il limite per cliente scavalca il default, e 0 è un cliente senza mele", async () => {
    const none = await addCustomer(houseA, "neri-snc", { weeklyRewardLimit: 0 });
    const refused = await app.inject({
      method: "POST",
      url: "/v1/reception/reward",
      headers: receptionHeaders(none.token),
      payload: { gosinoId: houseA.gosinoId },
    });
    expect(refused.statusCode).toBe(429);
    const rows = await db
      .select()
      .from(customerRewards)
      .where(eq(customerRewards.customerId, none.id));
    expect(rows).toHaveLength(0);
  });

  it("il gosino di un'altra casa risponde 404, e niente resta scritto (anti-BOLA)", async () => {
    const foreign = await app.inject({
      method: "POST",
      url: "/v1/reception/reward",
      headers: receptionHeaders(customerB.token),
      payload: { gosinoId: houseA.gosinoId },
    });
    expect(foreign.statusCode).toBe(404);
    const rows = await db
      .select()
      .from(customerRewards)
      .where(eq(customerRewards.customerId, customerB.id));
    expect(rows).toHaveLength(0);
  });
});
