import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, gosini, runMigrations, traitSets } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createHousehold,
  createHouseholdWithFounder,
} from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * La vetrina (ADR-083) su database vero.
 *
 * Le cose che solo un giro completo prova: che **si guardi senza token** (chi
 * guarda non ha ancora una casa), che ci finisca **solo un nato di un
 * allevamento**, e che quello che si vede sia l'aspetto e la genealogia —
 * **non** le case, non le persone, non il carattere in numeri.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let allevamento: string;
let famiglia: string;
let cucciolo: string;
let capostipite: string;
let diFamiglia: string;

const listing = (token: string, id: string, listed: boolean) =>
  app.inject({
    method: "POST",
    url: `/v1/gosini/${id}/vetrina`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({ listed }),
  });

interface Kennel {
  slug: string;
  name: string;
  cubs: { gosinoId: string; name: string; persona: string; look: Record<string, number> }[];
}

const browse = async (): Promise<Kennel[]> => {
  // nessuna intestazione: è una vetrina
  const response = await app.inject({ method: "GET", url: "/v1/vetrina" });
  expect(response.statusCode).toBe(200);
  return response.json<{ allevamenti: Kennel[] }>().allevamenti;
};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const kennel = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "allevamento",
    name: "Allevamento del Gosino",
    gosinoName: "Zero",
    breeder: true,
  });
  allevamento = kennel.ownerToken;
  capostipite = kennel.gosinoId;

  const home = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "famiglia",
    name: "Famiglia",
    gosinoName: "Pippo",
  });
  famiglia = home.ownerToken;
  diFamiglia = home.gosinoId;

  const [born] = await db
    .insert(gosini)
    .values({
      householdId: kennel.householdId,
      name: "Nino",
      origin: "nato",
      generation: 1,
      mortalFrom: new Date(),
      lifeJitterDays: 0,
    })
    .returning({ id: gosini.id });
  if (born === undefined) throw new Error("no cub");
  cucciolo = born.id;
  await db.insert(traitSets).values({
    householdId: kennel.householdId,
    gosinoId: cucciolo,
    version: 1,
    traits: { calm: 0.5, spots: 0.9, tail: 0.8, longevity: 0.9 },
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
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("chi ci può stare", () => {
  it("un nato dell'allevamento sì", async () => {
    expect((await listing(allevamento, cucciolo, true)).statusCode).toBe(200);
  });

  it("un capostipite no, nemmeno il suo", async () => {
    // sarebbe una linea che comincia due volte
    expect((await listing(allevamento, capostipite, true)).statusCode).toBe(422);
  });

  it("e una casa che non alleva non ha vetrina: non è un negozio", async () => {
    expect((await listing(famiglia, diFamiglia, true)).statusCode).toBe(403);
  });
});

describe("guardare, senza avere ancora una casa", () => {
  it("si legge senza token: è il momento prima di averne una", async () => {
    const kennels = await browse();
    expect(kennels).toHaveLength(1);
    expect(kennels[0]?.name).toBe("Allevamento del Gosino");
    expect(kennels[0]?.cubs.map((cub) => cub.name)).toEqual(["Nino"]);
  });

  it("si vede com'è fatto, e come si presenta", async () => {
    const [cub] = (await browse())[0]?.cubs ?? [];
    expect(cub?.persona).not.toBe("");
    expect(cub?.look.spots).toBeCloseTo(0.9, 2);
    expect(cub?.look.tail).toBeCloseTo(0.8, 2);
  });

  it("NON si vede il carattere in numeri, né quanto vivrà", async () => {
    // una scheda tecnica di un essere vivente inviterebbe a confrontare due
    // creature come due lavatrici; e la longevità è nascosta per ADR-077
    const [cub] = (await browse())[0]?.cubs ?? [];
    expect(Object.keys(cub?.look ?? {})).not.toContain("calm");
    expect(Object.keys(cub?.look ?? {})).not.toContain("longevity");
  });

  it("il pedigree di chi è in vetrina si guarda prima di comprare", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/vetrina/${cucciolo}/pedigree` });
    expect(response.statusCode).toBe(200);
  });

  it("ma quello di chi NON è in vetrina no: resta della sua casa", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/vetrina/${diFamiglia}/pedigree` });
    expect(response.statusCode).toBe(404);
  });

  it("tolto dalla vetrina, sparisce", async () => {
    expect((await listing(allevamento, cucciolo, false)).statusCode).toBe(200);
    expect(await browse()).toEqual([]);
  });
});

describe("la casa nasce vuota (ADR-082)", () => {
  it("senza chiedere un capostipite, non nasce nessuno", async () => {
    const empty = await createHousehold(db, MASTER_KEY, { slug: "vuota", name: "Vuota" });
    expect(empty.gosinoId).toBeUndefined();
    const rows = await db.select().from(gosini);
    expect(rows.filter((row) => row.householdId === empty.householdId)).toHaveLength(0);
  });
});
