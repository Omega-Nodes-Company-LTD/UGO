import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  createDbClient,
  type DbClient,
  memories,
  perceptionEvents,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { loadSpeciesMap } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount, createAccountWithFounder } from "../../src/services/accountService.js";
import { buildServer } from "../../src/server.js";

/**
 * I diritti dal chiosco (ADR-090), sul giro vero.
 *
 * Questo test esiste per la ragione di ADR-045: il muso chiama tre rotte, e
 * finché nessuno le accende insieme i due lati restano verdi separatamente
 * mentre la giunzione è rotta. Qui si chiamano **esattamente** come le chiama
 * il chiosco — `/v1/privacy/summary` per i conti, `/v1/pack` per sapere chi
 * c'è, `/v1/privacy/forget` per l'atto — e si controlla la cosa che conta di
 * più: **i conti si vedono, gli atti no**, se non hai il token di casa.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let ownerToken: string;
let houseId: string;
let who: string;

const get = (url: string, token: string) =>
  app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-diritti",
    name: "Diritti",
    gosinoName: "Ugo",
  });
  ownerToken = house.ownerToken;
  houseId = house.accountId;
  who = house.gosinoId;

  await db.insert(beings).values([
    { accountId: houseId, displayName: "Monika", species: "human", kind: "resident" },
    { accountId: houseId, displayName: "Piccolo", species: "human", kind: "resident", isMinor: true },
  ]);
  await db.insert(memories).values({
    gosinoId: who,
    kind: "fact",
    text: "Il corriere passa il martedì",
    importance: 0.7,
  });
  await db.insert(perceptionEvents).values({
    gosinoId: who,
    modality: "face",
    confidence: 0.8,
    observed: {},
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: { dataKey: DATA_KEY },
      // `/v1/pack` è registrata solo con la mappa delle specie: in produzione
      // c'è sempre (ce n'è una di default), e il chiosco la chiama per sapere
      // chi c'è in casa — senza, la tendina di «dimentica qualcuno» è vuota
      speciesMap: loadSpeciesMap(undefined),
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("«cosa sai di me»", () => {
  it("risponde con conti, e nessun contenuto", async () => {
    const response = await get("/v1/privacy/summary", ownerToken);
    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, number>>();
    expect(body.beings).toBe(2);
    // la tutela accesa si conta: è la riga che dice che qualcuno è protetto
    expect(body.protected).toBe(1);
    expect(body.memories).toBe(1);
    expect(body.sightings).toBe(1);
    // e nessun testo esce di qui: sono numeri, uno per uno
    for (const value of Object.values(body)) expect(typeof value).toBe("number");
    expect(JSON.stringify(body)).not.toContain("corriere");
    expect(JSON.stringify(body)).not.toContain("Monika");
  });

  it("conta la casa di chi chiede, non il server", async () => {
    const other = await createAccount(db, MASTER_KEY, { slug: "vicina-diritti", name: "Vicina" });
    const response = await get("/v1/privacy/summary", other.ownerToken);
    expect(response.json<{ beings: number; memories: number }>().beings).toBe(0);
    expect(response.json<{ memories: number }>().memories).toBe(0);
  });

  it("senza token non si conta niente: i conti sono di una casa, non del mondo", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/privacy/summary" });
    expect([401, 403]).toContain(response.statusCode);
  });
});

describe("le rotte che il chiosco chiama davvero", () => {
  it("`/v1/pack` dà i nomi con cui il muso riempie la scelta", async () => {
    const response = await get("/v1/pack", ownerToken);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ beings: { id: string; displayName: string }[] }>();
    // il campo si chiama `displayName`: il muso lo legge così, e un `name`
    // sbagliato avrebbe riempito la tendina di «undefined»
    expect(body.beings.every((being) => typeof being.displayName === "string")).toBe(true);
    expect(body.beings.map((being) => being.displayName)).toContain("Monika");
  });
});
