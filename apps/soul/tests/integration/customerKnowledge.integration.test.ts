import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  customerChunks,
  customerGosini,
  customerMessages,
  customerRepos,
  customers,
  type DbClient,
  runMigrations,
} from "@ugo/db";
import { LlmClient, OllamaEmbeddingsClient } from "@ugo/memory";
import { encryptText } from "@ugo/shared";
import { startLlmStub, startOllama, startPostgres, type LlmStub, type OllamaHandle } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueCustomerToken } from "../../src/services/reception/customerAuth.js";
import { CustomerQuota } from "../../src/services/reception/customerQuota.js";
import { GithubLiveService } from "../../src/services/reception/githubLiveService.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * The knowledge sources end to end (ADR-054): real Postgres, real Ollama
 * embeddings, network-level stubs for the provider and for GitHub. The chunk
 * of one customer must never reach another's prompt — that is the test that
 * makes `searchCustomerChunks`' mandatory scope real.
 */

const RECEPTION_TOKEN = "reception-secret";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let stub: LlmStub;
let github: Server;
let githubUrl = "";
let db: DbClient;
let app: FastifyInstance;
let house: TestHouse;
let embedder: OllamaEmbeddingsClient;
let ownerToken = "";
let customerA: { id: string; token: string };
let customerB: { id: string; token: string };

async function addCustomer(slug: string): Promise<{ id: string; token: string }> {
  const [row] = await db
    .insert(customers)
    .values({ householdId: house.id, name: slug, slug })
    .returning({ id: customers.id });
  if (row === undefined) throw new Error("customer not created");
  await db
    .insert(customerGosini)
    .values({ householdId: house.id, customerId: row.id, gosinoId: house.gosinoId });
  const issued = await issueCustomerToken(db, {
    householdId: house.id,
    customerId: row.id,
    label: slug,
  });
  return { id: row.id, token: issued.token };
}

async function seedChunk(customerId: string, ref: string, text: string): Promise<void> {
  const [embedding] = await embedder.embed([`${ref}\n${text}`]);
  if (embedding === undefined) throw new Error("no embedding");
  await db.insert(customerChunks).values({
    householdId: house.id,
    customerId,
    sourceType: "repo",
    sourceId: crypto.randomUUID(),
    ref,
    text: encryptText(text, dataKey),
    embedding,
  });
}

const headers = (token: string): Record<string, string> => ({
  authorization: `Bearer ${RECEPTION_TOKEN}`,
  "x-reception-customer": token,
});

beforeAll(async () => {
  const [postgres, ollamaHandle, llmStub] = await Promise.all([
    startPostgres(),
    startOllama(),
    startLlmStub(),
  ]);
  pg = postgres.container;
  ollama = ollamaHandle;
  stub = llmStub;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, "nomic-embed-text");

  // a tiny GitHub: two GET endpoints, exactly what the adapter may touch
  github = createServer((req, res) => {
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
  ownerToken = (await issueToken(db, { householdId: house.id, role: "owner", label: "t" })).token;
  customerA = await addCustomer("rossi-know");
  customerB = await addCustomer("bianchi-know");

  const llmFor = (householdId: string, gosinoId: string): LlmClient =>
    new LlmClient({
      db,
      apiKey: "stub",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 10,
      householdId,
      gosinoId,
      baseUrl: stub.baseUrl,
      timezone: "Europe/Rome",
    });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: ollama.baseUrl,
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      customers: { dataKey },
      internalToken: "internal",
      reception: {
        token: RECEPTION_TOKEN,
        dataKey,
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
  await Promise.all([pg.stop(), ollama.container.stop(), stub.close()]);
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
      householdId: house.id,
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

    stub.reset();
    stub.nextResponse = { text: "Sta in src/main.ts." };
    const response = await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(customerA.token),
      payload: { gosinoId: house.gosinoId, text: "Dove parte il bottone di export CSV?" },
    });
    expect(response.statusCode).toBe(200);
    expect(stub.requests).toHaveLength(1);
    const dynamic = stub.requests[0]?.body.system[2]?.text ?? "";
    expect(dynamic).toContain("src/main.ts@abc1234");
    expect(dynamic).toContain("bottone di export CSV");
    expect(dynamic).not.toContain("Bianchi");
    expect(dynamic).not.toContain("strategia riservata");
  });

  it("wakes the GitHub adapter only on live-state questions", async () => {
    stub.reset();
    await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(customerA.token),
      payload: { gosinoId: house.gosinoId, text: "Come vanno le PR aperte?" },
    });
    const withLive = stub.requests[0]?.body.system[2]?.text ?? "";
    expect(withLive).toContain("PR #12");
    expect(withLive).toContain("abc1234");

    stub.reset();
    await app.inject({
      method: "POST",
      url: "/v1/reception/chat",
      headers: headers(customerA.token),
      payload: { gosinoId: house.gosinoId, text: "Che colore ha il logo?" },
    });
    const withoutLive = stub.requests[0]?.body.system[2]?.text ?? "";
    expect(withoutLive).not.toContain("PR #12");
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
    stub.reset();
    stub.nextResponse = { text: "Si usa pnpm turbo build." };
    const first = await ask(customerA.token, "Come si compila il progetto?");
    expect(first.cached).toBe(false);
    expect(stub.requests).toHaveLength(1);

    // shouted and re-spaced, same question: the exact tier normalizes it
    const second = await ask(customerA.token, "COME   si compila il progetto?");
    expect(second.cached).toBe(true);
    expect(second.reply).toBe("Si usa pnpm turbo build.");
    expect(stub.requests).toHaveLength(1);

    // near-identical wording lands on the semantic tier, still zero tokens
    const third = await ask(customerA.token, "Come si compila il progetto??");
    expect(third.cached).toBe(true);
    expect(stub.requests).toHaveLength(1);

    const rows = await db
      .select()
      .from(customerMessages)
      .where(eq(customerMessages.customerId, customerA.id));
    expect(rows.filter((row) => row.cached).length).toBeGreaterThanOrEqual(2);
  });

  it("a knowledge reindex strands every cached answer", async () => {
    stub.reset();
    stub.nextResponse = { text: "Risposta aggiornata." };
    await db
      .update(customers)
      .set({ knowledgeEpoch: sql`${customers.knowledgeEpoch} + 1` })
      .where(eq(customers.id, customerA.id));
    const again = await ask(customerA.token, "Come si compila il progetto?");
    expect(again.cached).toBe(false);
    expect(stub.requests).toHaveLength(1);
  });

  it("never caches a live-state answer", async () => {
    stub.reset();
    await ask(customerA.token, "Ci sono commit nuovi oggi?");
    await ask(customerA.token, "Ci sono commit nuovi oggi?");
    expect(stub.requests).toHaveLength(2);
  });
});
