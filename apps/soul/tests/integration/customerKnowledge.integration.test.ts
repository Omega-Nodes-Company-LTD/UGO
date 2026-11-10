import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  customerChunks,
  customerGosini,
  customerMessages,
  customerRepos,
  customers,
  type DbClient,
  runMigrations,
} from "@ugo/db";
import { DEFAULT_CHAT_MODEL, LlmClient, OpenRouterEmbeddingsClient } from "@ugo/memory";
import { encryptText } from "@ugo/shared";
import { openRouterKey, startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueCustomerToken } from "../../src/services/reception/customerAuth.js";
import { CustomerQuota } from "../../src/services/reception/customerQuota.js";
import { GithubLiveService } from "../../src/services/reception/githubLiveService.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * The knowledge sources end to end (ADR-054): real Postgres, real embeddings
 * and the real model, both on OpenRouter (ADR-125/131), and a network-level
 * GitHub. The chunk of one customer must never reach another's answer — that
 * is the test that makes `searchCustomerChunks`' mandatory scope real.
 */

const RECEPTION_TOKEN = "reception-secret";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let github: Server;
let githubUrl = "";
/** quante volte l'adattatore GitHub ha bussato: si sveglia solo sullo stato vivo */
let githubHits = 0;
let db: DbClient;
let app: FastifyInstance;
let house: TestHouse;
let embedder: OpenRouterEmbeddingsClient;
let ownerToken = "";
let customerA: { id: string; token: string };
let customerB: { id: string; token: string };

async function addCustomer(slug: string): Promise<{ id: string; token: string }> {
  const [row] = await db
    .insert(customers)
    .values({ accountId: house.id, name: slug, slug })
    .returning({ id: customers.id });
  if (row === undefined) throw new Error("customer not created");
  await db
    .insert(customerGosini)
    .values({ accountId: house.id, customerId: row.id, gosinoId: house.gosinoId });
  const issued = await issueCustomerToken(db, {
    accountId: house.id,
    customerId: row.id,
    label: slug,
  });
  return { id: row.id, token: issued.token };
}

async function seedChunk(customerId: string, ref: string, text: string): Promise<void> {
  const [embedding] = await embedder.embed([`${ref}\n${text}`]);
  if (embedding === undefined) throw new Error("no embedding");
  await db.insert(customerChunks).values({
    accountId: house.id,
    customerId,
    sourceType: "repo",
    sourceId: crypto.randomUUID(),
    ref,
    text: encryptText(text, dataKey),
    embedding,
  });
}

/**
 * quante risposte pagate ha chiesto la casa: chi chiama OpenRouter scrive una
 * riga. ADR-131: anche gli embedding ne scrivono una, quindi si contano solo
 * quelle del modello di chat — è lui che la quota deve tenere fermo.
 */
async function providerCalls(): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(budgetLedger)
    .where(
      and(
        eq(budgetLedger.accountId, house.id),
        eq(budgetLedger.provider, "openrouter"),
        eq(budgetLedger.model, DEFAULT_CHAT_MODEL),
      ),
    );
  return Number(row?.count ?? 0);
}

const headers = (token: string): Record<string, string> => ({
  authorization: `Bearer ${RECEPTION_TOKEN}`,
  "x-reception-customer": token,
});

beforeAll(async () => {
  const postgres = await startPostgres();
  pg = postgres.container;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);
  embedder = new OpenRouterEmbeddingsClient({ db, apiKey: openRouterKey() });

  // a tiny GitHub: two GET endpoints, exactly what the adapter may touch
  github = createServer((req, res) => {
    githubHits += 1;
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url?.includes("/pulls") === true) {
      res.end(JSON.stringify([{ number: 12, title: "Aggiunge l'export CSV" }]));
    } else {
      res.end(
        JSON.stringify([
          { sha: "abc1234def", commit: { message: "fix: bottone", author: { date: "2026-08-14" } } },
        ]),
      );
    }
  });
  await new Promise<void>((resolve) => {
    github.listen(0, "127.0.0.1", resolve);
  });
  githubUrl = `http://127.0.0.1:${String((github.address() as AddressInfo).port)}`;

  house = await createHouse(db, "casa-conoscenza");
  ownerToken = (await issueToken(db, { accountId: house.id, role: "owner", label: "t" })).token;
  customerA = await addCustomer("rossi-know");
  customerB = await addCustomer("bianchi-know");

  const llmFor = (accountId: string, gosinoId: string): LlmClient =>
    new LlmClient({
      db,
      apiKey: openRouterKey(),
      model: DEFAULT_CHAT_MODEL,
      dailyBudgetUsd: 10,
      accountId,
      gosinoId,
      timezone: "Europe/Rome",
    });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      customers: { dataKey },
      internalToken: "internal",
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
        embedder,
        github: new GithubLiveService({ db, dataKey, baseUrl: githubUrl }),
      },
    },
  });
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve, reject) => {
    github.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await db.$client.end();
  await pg.stop();
});

describe("the sources from the panel", () => {
  it("stores the PAT encrypted and never returns it", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerA.id}/repos`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { remoteUrl: "https://github.com/studio/progetto", pat: "ghp_secret123" },
    });
    expect(created.statusCode).toBe(201);
    const [row] = await db
      .select({ pat: customerRepos.pat })
      .from(customerRepos)
      .where(eq(customerRepos.customerId, customerA.id));
    expect(row?.pat?.startsWith("v1:")).toBe(true);
    expect(row?.pat).not.toContain("ghp_secret123");

    const sources = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerA.id}/sources`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(sources.statusCode).toBe(200);
    expect(sources.body).not.toContain("ghp_secret123");
    expect(sources.body).not.toContain(row?.pat ?? "@@none@@");
  });

  it("deleting a repo takes its chunks with it", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerA.id}/repos`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { remoteUrl: "https://github.com/studio/altro" },
    });
    const { id: repoId } = created.json<{ id: string }>();
    const [embedding] = await embedder.embed(["orphan"]);
    await db.insert(customerChunks).values({
      accountId: house.id,
      customerId: customerA.id,
      sourceType: "repo",
      sourceId: repoId,
      ref: "x@111",
      text: encryptText("orfano", dataKey),
      embedding: embedding ?? [],
    });
    const gone = await app.inject({
      method: "DELETE",
      url: `/v1/customers/${customerA.id}/repos/${repoId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(gone.statusCode).toBe(204);
    const left = await db
      .select()
      .from(customerChunks)
      .where(eq(customerChunks.sourceId, repoId));
    expect(left).toHaveLength(0);
  });
});

describe("repo alla mano", () => {
  it("answers with the customer's chunks in context — and never a neighbour's", async () => {
    await seedChunk(
      customerA.id,
      "src/main.ts@abc1234",
      "export function avvia() { /* il bottone di export CSV parte da qui */ }",
    );
    await seedChunk(
      customerB.id,
      "segreto/di-bianchi.ts@fff0000",
      "la strategia riservata di Bianchi SPA",
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(customerA.token),
      payload: {
        gosinoId: house.gosinoId,
        text: "In quale file del repo parte il bottone di export CSV? Dimmi il percorso.",
      },
    });
    expect(response.statusCode).toBe(200);
    // il pezzo di A è arrivato al modello: risponde col file che c'è scritto
    const reply = response.json<{ reply: string }>().reply.toLowerCase();
    expect(reply).toContain("main.ts");
    // e quello del vicino no
    expect(reply).not.toContain("bianchi");
    expect(reply).not.toContain("strategia riservata");
  });

  it("wakes the GitHub adapter only on live-state questions", async () => {
    const hitsBefore = githubHits;
    const live = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(customerA.token),
      payload: { gosinoId: house.gosinoId, text: "Come vanno le PR aperte? Dimmi numero e titolo." },
    });
    expect(githubHits).toBeGreaterThan(hitsBefore);
    // lo stato vivo è arrivato al modello: conosce la PR che GitHub ha detto
    expect(live.json<{ reply: string }>().reply).toMatch(/12|export csv/i);

    const hitsAfterLive = githubHits;
    await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(customerA.token),
      payload: { gosinoId: house.gosinoId, text: "Che colore ha il logo?" },
    });
    expect(githubHits).toBe(hitsAfterLive);
  });
});

describe("the answer cache (ADR-055)", () => {
  const ask = async (
    token: string,
    text: string,
  ): Promise<{ reply: string; cached: boolean }> => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(token),
      payload: { gosinoId: house.gosinoId, text },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ reply: string; cached: boolean }>();
  };

  it("serves the repeated question from the cache: zero provider tokens", async () => {
    const callsBefore = await providerCalls();
    const first = await ask(customerA.token, "Come si compila il progetto?");
    expect(first.cached).toBe(false);
    expect(await providerCalls()).toBe(callsBefore + 1);

    // shouted and re-spaced, same question: the exact tier normalizes it
    const second = await ask(customerA.token, "COME   si compila il progetto?");
    expect(second.cached).toBe(true);
    expect(second.reply).toBe(first.reply);
    expect(await providerCalls()).toBe(callsBefore + 1);

    // near-identical wording lands on the semantic tier, still zero tokens
    const third = await ask(customerA.token, "Come si compila il progetto??");
    expect(third.cached).toBe(true);
    expect(await providerCalls()).toBe(callsBefore + 1);

    const rows = await db
      .select()
      .from(customerMessages)
      .where(eq(customerMessages.customerId, customerA.id));
    expect(rows.filter((row) => row.cached).length).toBeGreaterThanOrEqual(2);
  });

  it("a knowledge reindex strands every cached answer", async () => {
    const callsBefore = await providerCalls();
    await db
      .update(customers)
      .set({ knowledgeEpoch: sql`${customers.knowledgeEpoch} + 1` })
      .where(eq(customers.id, customerA.id));
    const again = await ask(customerA.token, "Come si compila il progetto?");
    expect(again.cached).toBe(false);
    expect(await providerCalls()).toBe(callsBefore + 1);
  });

  it("never caches a live-state answer", async () => {
    const callsBefore = await providerCalls();
    await ask(customerA.token, "Ci sono commit nuovi oggi?");
    await ask(customerA.token, "Ci sono commit nuovi oggi?");
    expect(await providerCalls()).toBe(callsBefore + 2);
  });
});
