import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  creditLedger,
  providerCredentials,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { BAD_KEY, startLlmStub, startPostgres, type LlmStub } from "@ugo/factories";
import { INVALID_KEY_REPLY, KEYLESS_REPLY, ModelCatalog } from "@ugo/memory";
import { encryptText, generateDataKey } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { AiResolver } from "../../src/services/ai/resolver.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-122 / ADR-129 / ADR-130: le chiavi della casa, un modello per ruolo, e
 * il sogno che pensa passando da soul. Postgres vero, stub di rete vero: la
 * chiave che il pannello salva è la chiave che arriva al provider, e lo si
 * prova leggendo l'header della richiesta catturata, non la colonna.
 */

const MASTER = generateDataKey();
const OPERATOR = "operatore-del-test";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let stub: LlmStub;
let app: FastifyInstance;
let resolver: AiResolver;
let mine: TestHouse;
let theirs: TestHouse;
let myToken = "";
let theirToken = "";

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  stub = await startLlmStub();
  mine = await createHouse(db, "casa-ai", { masterKey: MASTER });
  theirs = await createHouse(db, "casa-ai-vicini", { masterKey: MASTER });
  myToken = (await issueToken(db, { accountId: mine.id, role: "owner", label: "mia" })).token;
  theirToken = (await issueToken(db, { accountId: theirs.id, role: "owner", label: "loro" })).token;

  const baseUrls = { anthropic: stub.baseUrl, openrouter: stub.baseUrl, openai: stub.baseUrl };
  const platform = { openrouter: "chiave-di-piattaforma" };
  resolver = new AiResolver({
    db,
    dbFor: () => db,
    masterKey: MASTER,
    dailyBudgetUsd: 5,
    platform,
    baseUrls,
    credit: { markup: 1.3, usdToEur: 0.92 },
  });
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    ai: {
      masterKey: MASTER,
      resolver,
      catalog: new ModelCatalog({ openRouterBaseUrl: stub.baseUrl, anthropicBaseUrl: stub.baseUrl }),
      platform,
      baseUrls,
      dailyBudgetUsd: 5,
    },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: OPERATOR,
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
  await stub.close();
});

const as = (token: string) => ({ authorization: `Bearer ${token}` });

describe("le chiavi della casa", () => {
  it("si provano prima di salvarle: una chiave rifiutata non entra", async () => {
    const refused = await app.inject({
      method: "PUT",
      url: "/v1/ai/chiavi/anthropic",
      headers: as(myToken),
      payload: { secret: BAD_KEY },
    });
    expect(refused.statusCode).toBe(422);
    expect(await db.select().from(providerCredentials)).toHaveLength(0);
  });

  it("si salvano cifrate con la DEK della casa e non tornano mai indietro", async () => {
    const secret = "sk-ant-della-casa-1234";
    const saved = await app.inject({
      method: "PUT",
      url: "/v1/ai/chiavi/anthropic",
      headers: as(myToken),
      payload: { secret },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ provider: "anthropic", hint: "…1234", status: "ok" });

    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.accountId, mine.id));
    expect(row?.secretEnc).not.toContain(secret);

    const status = await app.inject({ method: "GET", url: "/v1/ai/stato", headers: as(myToken) });
    expect(JSON.stringify(status.json())).not.toContain(secret);
  });

  it("la casa accanto non le vede", async () => {
    const status = await app.inject({ method: "GET", url: "/v1/ai/stato", headers: as(theirToken) });
    expect(status.json<{ chiavi: unknown[] }>().chiavi).toHaveLength(0);
  });
});

describe("un modello per ruolo, dalla lista del provider", () => {
  it("rifiuta un modello che il provider non elenca", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/chat",
      headers: as(myToken),
      payload: { provider: "anthropic", model: "claude-unpriced-9" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("rifiuta un provider senza chiave della casa", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/think",
      headers: as(myToken),
      payload: { provider: "openrouter", model: "mistralai/mistral-small" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("rifiuta per la visione un modello che non vede", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/vision",
      headers: as(myToken),
      payload: { source: "ugo", provider: "openrouter", model: "mistralai/mistral-small" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("filtra la lista per ruolo", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/ai/modelli?provider=openrouter&ruolo=vision",
      headers: as(myToken),
    });
    expect(res.json<{ modelli: { id: string }[] }>().modelli.map((m) => m.id)).toEqual([
      "anthropic/claude-haiku-4.5",
    ]);
  });
});

describe("la chat parla con la testa della casa", () => {
  it("senza scelta risponde che le manca una testa, senza chiamare nessuno", async () => {
    stub.reset();
    const reply = await resolver
      .chatFor(theirs.id, theirs.gosinoId, { timezone: "Europe/Rome", locale: "it-IT" })
      .chat({ channel: "home", userText: "ciao" });
    expect(reply).toMatchObject({ text: KEYLESS_REPLY, degraded: true });
    expect(stub.completions).toHaveLength(0);
  });

  it("con la scelta, la chiave della casa arriva al provider", async () => {
    const chosen = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/chat",
      headers: as(myToken),
      payload: { provider: "anthropic", model: "claude-haiku-4-5" },
    });
    expect(chosen.statusCode).toBe(204);
    stub.reset();
    const reply = await resolver
      .chatFor(mine.id, mine.gosinoId, { timezone: "Europe/Rome", locale: "it-IT" })
      .chat({ channel: "home", userText: "ciao" });
    expect(reply.degraded).toBe(false);
    expect(stub.completions[0]?.headers["x-api-key"]).toBe("sk-ant-della-casa-1234");
    const [row] = await db.select().from(budgetLedger).where(eq(budgetLedger.accountId, mine.id));
    expect(row).toMatchObject({ gosinoId: mine.gosinoId, keySource: "byok", model: "claude-haiku-4-5" });
  });

  it("le chiavi UGO a consumo scalano il credito della casa che le usa", async () => {
    await db.insert(creditLedger).values({ accountId: theirs.id, kind: "topup", amountMicros: 5_000_000 });
    const chosen = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/chat",
      headers: as(theirToken),
      payload: { source: "ugo", provider: "openrouter", model: "mistralai/mistral-small" },
    });
    expect(chosen.statusCode).toBe(204);
    stub.reset();
    stub.nextResponse = { cost: 0.002 };
    await resolver
      .chatFor(theirs.id, theirs.gosinoId, { timezone: "Europe/Rome", locale: "it-IT" })
      .chat({ channel: "home", userText: "ciao" });
    expect(stub.completions[0]?.headers.authorization).toBe("Bearer chiave-di-piattaforma");
    const debits = await db.select().from(creditLedger).where(eq(creditLedger.kind, "usage"));
    expect(debits.map((d) => d.accountId)).toEqual([theirs.id]);
  });

  it("una chiave che il provider rifiuta si segna, e la casa lo sente dire", async () => {
    await db
      .update(providerCredentials)
      .set({ secretEnc: encryptText(BAD_KEY, mine.dataKey) })
      .where(eq(providerCredentials.accountId, mine.id));
    resolver.invalidate(mine.id);
    const reply = await resolver
      .chatFor(mine.id, mine.gosinoId, { timezone: "Europe/Rome", locale: "it-IT" })
      .chat({ channel: "home", userText: "ciao" });
    expect(reply.text).toBe(INVALID_KEY_REPLY);
    await expect
      .poll(async () => (await db.select().from(providerCredentials).where(eq(providerCredentials.accountId, mine.id)))[0]?.status)
      .toBe("invalid");
  });
});

describe("il sogno chiede a soul (ADR-129)", () => {
  it("è una porta dell'operatore, non delle case", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/interno/pensa",
      headers: as(myToken),
      payload: { account_id: mine.id, prompt: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("senza ruolo think risponde 409, e il passo del sogno si salta", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/interno/pensa",
      headers: as(OPERATOR),
      payload: { account_id: mine.id, prompt: "rileggi la giornata" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("col ruolo think pensa con la chiave della casa", async () => {
    await db.insert(creditLedger).values({ accountId: theirs.id, kind: "topup", amountMicros: 5_000_000 });
    await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/think",
      headers: as(theirToken),
      payload: { source: "ugo", provider: "openrouter", model: "mistralai/mistral-small" },
    });
    stub.reset();
    stub.nextResponse = { text: '{"memorie": []}', cost: 0.001 };
    const res = await app.inject({
      method: "POST",
      url: "/v1/interno/pensa",
      headers: as(OPERATOR),
      payload: { account_id: theirs.id, prompt: "rileggi la giornata", max_tokens: 500 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: '{"memorie": []}' });
    expect(stub.completions[0]?.body.max_tokens).toBe(500);
  });
});

describe("il traghetto dall'env (ugo chiavi importa-da-env)", () => {
  it("porta la chiave nell'account, cifrata, e sceglie i ruoli di testo", async () => {
    const { importKeysFromEnv } = await import("../../src/services/ai/importFromEnv.js");
    const ferried = await createHouse(db, "casa-traghetto", { masterKey: MASTER });
    const report = await importKeysFromEnv(db, ferried.id, MASTER, {
      ANTHROPIC_API_KEY: "sk-ant-di-prima-9999",
      OPENAI_API_KEY: "",
    });
    expect(report).toEqual({ keys: ["anthropic"], roles: ["chat", "think", "vision", "judge"] });
    resolver.invalidate(ferried.id);
    stub.reset();
    await resolver
      .chatFor(ferried.id, ferried.gosinoId, { timezone: "Europe/Rome", locale: "it-IT" })
      .chat({ channel: "home", userText: "ci sei ancora?" });
    expect(stub.completions[0]?.headers["x-api-key"]).toBe("sk-ant-di-prima-9999");
  });
});
