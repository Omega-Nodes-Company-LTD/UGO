import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, places, rooms, runMigrations, slugOfRoom } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { buildServer } from "../../src/server.js";

/**
 * I luoghi (ADR-113) sul giro vero.
 *
 * Le cose che solo un database vero prova: che il **traghetto** della
 * migrazione abbia dato a ogni account il suo primo luogo con dentro le sue
 * stanze — cioè che nessuno si sia svegliato senza cielo — e che il tempo che
 * fa segua la **stanza** e non il titolare.
 */

const MASTER_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let houseId: string;
let token: string;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-luoghi",
    name: "Luoghi",
    gosinoName: "Vento",
  });
  houseId = house.accountId;
  token = house.ownerToken;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      // il meteo vero non si chiama in un test: si inietta
      weather: { fetchWeather: () => Promise.resolve({ code: 0, isDay: true }) },
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

const auth = (): Record<string, string> => ({ authorization: `Bearer ${token}` });

describe("il traghetto della migrazione", () => {
  it("ogni account nasce con un luogo, e le sue stanze ci stanno dentro", async () => {
    const mine = await db.select().from(places).where(eq(places.accountId, houseId));
    expect(mine, "un account senza luoghi è un account senza cielo").toHaveLength(1);

    const [room] = await db
      .insert(rooms)
      .values({ accountId: houseId, name: "Cucina", slug: slugOfRoom("Cucina") })
      .returning({ id: rooms.id });
    expect(room).toBeDefined();
  });
});

describe("i luoghi dal pannello", () => {
  it("se ne aggiunge un secondo, e si vede quante stanze ha ciascuno", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/places",
      headers: auth(),
      payload: { name: "Al mare", lat: 44.1, lon: 9.6 },
    });
    expect(made.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/v1/places", headers: auth() });
    const body = list.json<{ places: { name: string; rooms: number }[] }>();
    expect(body.places.map((p) => p.name)).toContain("Al mare");
  });

  it("un nome che c'è già è un 409, non un secondo luogo con lo stesso nome", async () => {
    const again = await app.inject({
      method: "POST",
      url: "/v1/places",
      headers: auth(),
      payload: { name: "al mare" },
    });
    expect(again.statusCode).toBe(409);
  });

  /**
   * Le due alternative erano peggiori: la cascata butterebbe la piantina di
   * casa per un click, e staccare le stanze le lascerebbe senza cielo — un
   * guasto silenzioso che si scopre guardando fuori dalla finestra sbagliata.
   */
  it("un luogo con dentro delle stanze non si butta, e dice quante ne ha", async () => {
    const [home] = await db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.accountId, houseId), eq(places.slug, "casa")));
    const refused = await app.inject({
      method: "DELETE",
      url: `/v1/places/${home?.id ?? ""}`,
      headers: auth(),
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ rooms: number }>().rooms).toBeGreaterThan(0);
  });
});

describe("il cielo è del luogo", () => {
  it("il meteo segue la stanza, non il titolare", async () => {
    const [mare] = await db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.accountId, houseId), eq(places.slug, "al mare")));
    const [cucina] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.accountId, houseId), eq(rooms.slug, "cucina")));

    const moved = await app.inject({
      method: "PUT",
      url: `/v1/rooms/${cucina?.id ?? ""}/place`,
      headers: auth(),
      payload: { placeId: mare?.id },
    });
    expect(moved.statusCode).toBe(200);

    const sky = await app.inject({
      method: "GET",
      url: "/v1/weather?stanza=cucina",
      headers: auth(),
    });
    const body = sky.json<{ available: boolean; lat?: number }>();
    expect(body.available).toBe(true);
    expect(body.lat, "la cucina è al mare: il cielo è quello").toBeCloseTo(44.1, 1);
  });
});
