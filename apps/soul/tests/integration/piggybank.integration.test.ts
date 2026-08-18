import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  type DbClient,
  gosini,
  households,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { HUNGRY_REPLY, LlmClient } from "@ugo/memory";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createHousehold,
  createHouseholdWithFounder,
} from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * Il metabolismo (ADR-072) su database vero.
 *
 * Le due cose che solo un giro completo può provare: che la fame arrivi
 * davvero quando il salvadanaio è vuoto — **senza mai chiamare il provider**,
 * che è il punto del guard — e che il metabolismo STRINGA e non allarghi: un
 * esemplare ben nutrito non deve poter superare il tetto della casa.
 */

const MASTER_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let houseId: string;
let token: string;
let who: string;

/**
 * Il provider non deve mai essere chiamato, e la prova è questo indirizzo:
 * `127.0.0.1:1` non risponde a nessuno. Se il guard lasciasse passare la
 * chiamata, il test morirebbe con un errore di connessione invece di ottenere
 * una degradazione pulita — quindi «risposta degradata senza eccezioni» È
 * l'asserzione che il provider non è stato sfiorato. Un contatore finto
 * direbbe la stessa cosa senza garantirla.
 */
const NEVER_CALLED = "http://127.0.0.1:1";

const clientFor = (gosinoId: string): LlmClient =>
  new LlmClient({
    db,
    apiKey: "mai-usata",
    model: "claude-haiku-4-5",
    dailyBudgetUsd: 1,
    householdId: houseId,
    gosinoId,
    baseUrl: NEVER_CALLED,
  });

const feed = (gosinoId: string, amountUsd: number, kind = "affetto") =>
  app.inject({
    method: "POST",
    url: `/v1/gosini/${gosinoId}/feed`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({ kind, amountUsd, note: "prova" }),
  });

const piggyBank = (gosinoId: string) =>
  app.inject({
    method: "GET",
    url: `/v1/gosini/${gosinoId}/piggybank`,
    headers: { authorization: `Bearer ${token}` },
  });

const metabolism = (on: boolean) =>
  app.inject({
    method: "PUT",
    url: "/v1/households/metabolism",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({ on }),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "casa-fame",
    name: "Fame",
    gosinoName: "Ghiotto",
  });
  houseId = house.householdId;
  token = house.ownerToken;
  who = house.gosinoId;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: {},
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("il salvadanaio", () => {
  it("col metabolismo spento non ha fame, qualunque sia il saldo", async () => {
    const response = await piggyBank(who);
    expect(response.statusCode).toBe(200);
    const bank = response.json<{ metabolism: boolean; balanceUsd: number; hungry: boolean }>();
    expect(bank.metabolism).toBe(false);
    expect(bank.balanceUsd).toBe(0);
    // il saldo si vede lo stesso: si guarda PRIMA di accendere
    expect(bank.hungry).toBe(false);
  });

  it("acceso e a saldo zero, ha fame — e lo dice con parole sue", async () => {
    expect((await metabolism(true)).statusCode).toBe(200);
    const bank = piggyBank(who);
    expect((await bank).json<{ hungry: boolean }>().hungry).toBe(true);

    const result = await clientFor(who).chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(true);
    expect(result.text).toBe(HUNGRY_REPLY);
  });

  it("dargli da mangiare lo rimette in piedi, e il pasto resta nel registro", async () => {
    const fed = await feed(who, 0.5, "lavoro");
    expect(fed.statusCode).toBe(201);
    expect(fed.json<{ balanceUsd: number }>().balanceUsd).toBeCloseTo(0.5, 6);

    const bank = (await piggyBank(who)).json<{
      hungry: boolean;
      fedUsd: number;
      meals: { kind: string; amountUsd: number }[];
    }>();
    expect(bank.hungry).toBe(false);
    expect(bank.fedUsd).toBeCloseTo(0.5, 6);
    expect(bank.meals[0]?.kind).toBe("lavoro");
  });

  it("quello che consuma si mangia il saldo", async () => {
    await db.insert(budgetLedger).values({
      householdId: houseId,
      gosinoId: who,
      date: "2026-08-17",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "0.400000",
    });
    const bank = (await piggyBank(who)).json<{ balanceUsd: number; hungry: boolean }>();
    expect(bank.balanceUsd).toBeCloseTo(0.1, 6);
    expect(bank.hungry).toBe(false);

    await db.insert(budgetLedger).values({
      householdId: houseId,
      gosinoId: who,
      date: "2026-08-17",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "0.200000",
    });
    const after = (await piggyBank(who)).json<{ balanceUsd: number; hungry: boolean }>();
    expect(after.balanceUsd).toBeLessThan(0);
    expect(after.hungry).toBe(true);
  });

  it("il metabolismo STRINGE e non allarga: il tetto della casa resta il muro esterno", async () => {
    // pancia pienissima…
    await feed(who, 500);
    const bank = (await piggyBank(who)).json<{ hungry: boolean }>();
    expect(bank.hungry).toBe(false);

    // …ma la casa ha già speso il suo tetto per oggi
    await db.update(households).set({ dailyBudgetUsd: "0.0001" }).where(eq(households.id, houseId));
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(budgetLedger).values({
      householdId: houseId,
      gosinoId: who,
      date: today,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "1.000000",
    });

    const result = await clientFor(who).chat({ channel: "home", userText: "ciao" });
    expect(result.degraded).toBe(true);
    // il messaggio è quello del TETTO, non della fame: il muro esterno vince
    expect(result.text).not.toBe(HUNGRY_REPLY);
  });

  it("il vicino non dà da mangiare alle creature altrui", async () => {
    const other = await createHousehold(db, MASTER_KEY, { slug: "casa-vicina", name: "Vicina" });
    const response = await app.inject({
      method: "POST",
      url: `/v1/gosini/${who}/feed`,
      headers: { authorization: `Bearer ${other.ownerToken}`, "content-type": "application/json" },
      payload: JSON.stringify({ kind: "affetto", amountUsd: 1 }),
    });
    expect(response.statusCode).toBe(404);
  });

  it("rifiuta un pasto senza senso invece di registrarlo", async () => {
    const negative = await feed(who, -5);
    expect(negative.statusCode).toBe(400);
    const wrongKind = await app.inject({
      method: "POST",
      url: `/v1/gosini/${who}/feed`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ kind: "pizza", amountUsd: 1 }),
    });
    expect(wrongKind.statusCode).toBe(400);
  });
});

describe("il genoma resta invariato dal cibo", () => {
  it("un pasto non tocca i tratti: si nutre la creatura, non si riscrive", async () => {
    const [before] = await db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, who));
    await feed(who, 1);
    const [after] = await db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, who));
    expect(after?.traits).toEqual(before?.traits);
    const [row] = await db.select({ name: gosini.name }).from(gosini).where(eq(gosini.id, who));
    expect(row?.name).toBe("Ghiotto");
  });
});
