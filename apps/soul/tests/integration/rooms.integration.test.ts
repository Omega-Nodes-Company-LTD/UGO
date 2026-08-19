import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, gosini, accounts, rooms, runMigrations, type DbClient } from "@ugo/db";
import type { EmbeddingsClient, LocalTextClient } from "@ugo/memory";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GosinoRegistry } from "../../src/services/pack/runtimes.js";
import { InitiativeSwitch } from "../../src/services/volition/initiativeSwitch.js";
import { buildServer } from "../../src/server.js";

/**
 * The rooms as a catalogue (ADR-039), against a real database.
 *
 * The behaviour worth its runtime is not "does POST insert a row" — it is the
 * two properties that make the room a thing rather than a spelling: an **empty
 * room survives** having nobody in it, and **nothing can write a label the
 * catalogue does not know**. Both are invisible when they break: the panel just
 * quietly offers, or accepts, a room that isn't one.
 *
 * The model clients are stubbed at the object boundary because nothing here
 * calls them; the database, the routes and the registry are real.
 */

const TOKEN = "operator-token";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let registry: GosinoRegistry;
let ugo: string;
let accountId: string;

const idleEmbedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0))),
};
const idleLocal: LocalTextClient = {
  generate: () => Promise.resolve(undefined),
  available: () => Promise.resolve(false),
};

const auth = { authorization: `Bearer ${TOKEN}` };
/** What one `inject` resolves to, without naming light-my-request directly. */
type Sent = Awaited<ReturnType<FastifyInstance["inject"]>>;
const post = async (url: string, body: object): Promise<Sent> =>
  await app.inject({ method: "POST", url, headers: auth, payload: body });
const patch = async (url: string, body: object): Promise<Sent> =>
  await app.inject({ method: "PATCH", url, headers: auth, payload: body });
const del = async (url: string): Promise<Sent> =>
  await app.inject({ method: "DELETE", url, headers: auth });
const listRooms = async (): Promise<{ id: string; room: string; gosini: { name: string }[] }[]> =>
  (await app.inject({ method: "GET", url: "/v1/rooms" })).json<{
    rooms: { id: string; room: string; gosini: { name: string }[] }[];
  }>().rooms;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());

  const houses = await db.select({ id: accounts.id }).from(accounts).limit(1);
  const found = houses[0]?.id;
  if (found === undefined) throw new Error("the migrations seed one account");
  accountId = found;

  const born = await db
    .insert(gosini)
    .values([{ accountId: found, name: "Ugo", locationLabel: "cucina" }])
    .returning({ id: gosini.id });
  ugo = born[0]?.id ?? "";
  // the room he was seeded into has to exist, the way the backfill makes it
  await db.insert(rooms).values({ accountId: found, name: "cucina", slug: "cucina" });

  registry = await GosinoRegistry.load({
    db,
    // ADR-098: nei test la connessione di processo e' l'owner, quindi la
    // "connessione della casa" puo' essere la stessa — il muro qui non morde
    dbFor: () => db,
    embedder: idleEmbedder,
    // ADR-019 fase 2: `llm` e' una fabbrica per esemplare, non un client.
    // Qui era `undefined as never`, che compilava finche' il client veniva solo
    // conservato — e il giorno in cui ha cominciato a essere *chiamato* il cast
    // ha nascosto il cambio di firma al compilatore. Lo ha trovato la CI.
    llm: () => undefined as never,
    local: idleLocal,
    dataKey,
    timezone: "Europe/Rome",
    localModelUp: () => false,
    initiativeEnabled: () => true,
    hourOf: () => 15,
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: registry.resolve(undefined, accountId)?.psyche as never,
      registry,
      initiative: new InitiativeSwitch(() => true),
      stats: { dailyBudgetUsd: 0.5, timezone: "Europe/Rome" },
      gosini: {},
      internalToken: TOKEN,
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("the rooms of the house", () => {
  it("keeps a room nobody lives in, which is the whole reason to make one", async () => {
    const made = await post("/v1/rooms", { name: "officina" });
    expect(made.statusCode).toBe(201);

    const empty = (await listRooms()).find((r) => r.room === "officina");
    expect(empty).toBeDefined();
    expect(empty?.gosini).toEqual([]);
  });

  it("lists who is in each room, and the room says its own name", async () => {
    const kitchen = (await listRooms()).find((r) => r.room === "cucina");

    expect(kitchen?.gosini.map((g) => g.name)).toEqual(["Ugo"]);
  });

  it("treats two spellings of one room as one room, and hands back the first", async () => {
    const first = await post("/v1/rooms", { name: "Salotto" });
    const again = await post("/v1/rooms", { name: "  SALOTTO " });

    expect(first.statusCode).toBe(201);
    // not an error: asking for a room that exists and getting it is what was meant
    expect(again.statusCode).toBe(200);
    expect(again.json<{ created: boolean; room: string }>()).toMatchObject({
      created: false,
      room: "Salotto",
    });
    expect((await listRooms()).filter((r) => r.room.toLowerCase() === "salotto")).toHaveLength(1);
  });

  it("refuses a name that is only whitespace", async () => {
    expect((await post("/v1/rooms", { name: "   " })).statusCode).toBe(400);
  });

  it("needs the operator token to make one, and none to read them", async () => {
    const naked = await app.inject({ method: "POST", url: "/v1/rooms", payload: { name: "x" } });
    expect(naked.statusCode).toBe(401);
    // the body has no token and still has to know which rooms exist
    expect((await app.inject({ method: "GET", url: "/v1/rooms" })).statusCode).toBe(200);
  });
});

describe("moving somebody", () => {
  it("puts him in a room that exists, spelled the way the catalogue spells it", async () => {
    await post("/v1/rooms", { name: "Studio" });

    const moved = await patch(`/v1/gosini/${ugo}`, { locationLabel: "studio" });

    expect(moved.statusCode).toBe(200);
    // asked in lowercase, stored as the room is actually called
    expect(moved.json<{ where: string }>().where).toBe("Studio");
  });

  it("refuses a room that is not one, instead of inventing it", async () => {
    const nowhere = await patch(`/v1/gosini/${ugo}`, { locationLabel: "cantina segreta" });

    expect(nowhere.statusCode).toBe(400);
    expect((await listRooms()).some((r) => r.room === "cantina segreta")).toBe(false);
  });

  it("still takes him out of every room on an empty label", async () => {
    const out = await patch(`/v1/gosini/${ugo}`, { locationLabel: "" });

    expect(out.statusCode).toBe(200);
    expect(out.json<{ where: string | null }>().where).toBeNull();
  });

  it("refuses to be born into a room that is not one", async () => {
    const born = await post("/v1/gosini", { name: "Pino", locationLabel: "veranda" });

    expect(born.statusCode).toBe(400);
  });

  it("is born into a room that is one", async () => {
    await post("/v1/rooms", { name: "veranda" });
    const born = await post("/v1/gosini", { name: "Pino", locationLabel: "veranda" });

    expect(born.statusCode).toBe(201);
    expect(born.json<{ where: string }>().where).toBe("veranda");
  });
});

describe("unmaking a room", () => {
  it("does not take its residents with it: they come out, they do not vanish", async () => {
    await post("/v1/rooms", { name: "ripostiglio" });
    await patch(`/v1/gosini/${ugo}`, { locationLabel: "ripostiglio" });
    const id = (await listRooms()).find((r) => r.room === "ripostiglio")?.id ?? "";

    const gone = await del(`/v1/rooms/${id}`);

    expect(gone.statusCode).toBe(200);
    expect(gone.json<{ evicted: number }>().evicted).toBe(1);
    expect((await listRooms()).some((r) => r.room === "ripostiglio")).toBe(false);

    // he is still here, simply on no device — the state of one never given a room
    const still = await db.select({ where: gosini.locationLabel }).from(gosini);
    expect(still.some((row) => row.where === "ripostiglio")).toBe(false);
    const registered = registry.everywhere().find((r) => r.id === ugo);
    expect(registered?.where).toBeUndefined();
  });

  it("says so when there is nothing to unmake", async () => {
    const missing = await del("/v1/rooms/00000000-0000-4000-8000-00000000dead");

    expect(missing.statusCode).toBe(404);
  });
});
