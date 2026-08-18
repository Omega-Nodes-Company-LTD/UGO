import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, gosini, psycheSnapshots, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount, createAccountWithFounder } from "../../src/services/accountService.js";
import { PackMood } from "../../src/services/packMood.js";
import { buildServer } from "../../src/server.js";

/**
 * L'umore del branco nel tempo (ADR-087) su database vero.
 *
 * La cosa che solo un database può dire, ed è la ragione per cui questa serie
 * esiste separata da quella di `/v1/stats`: che **le creature non si
 * mescolino**. Due gosini sotto lo stesso tetto scrivono nella stessa tabella,
 * e una media che li impastasse insieme non sarebbe la storia di nessuno dei
 * due — sarebbe una linea che nessuno ha vissuto.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);
const DAY = 86_400_000;

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let token: string;
let houseId: string;
let sereno: string;
let teso: string;
let mood: PackMood;

/** Due istantanee nello stesso giorno: la media giornaliera ha senso solo se ce n'è più d'una. */
const snapshot = async (who: string, daysAgo: number, umore: number, stress: number) => {
  await db.insert(psycheSnapshots).values({
    gosinoId: who,
    ts: new Date(Date.now() - daysAgo * DAY),
    vars: { energia: 0.6, umore, affetto: 0.5, noia: 0.3, stress, curiosita: 0.5 },
    label: "prova",
  });
};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-branco",
    name: "Branco",
    gosinoName: "Sereno",
  });
  token = house.ownerToken;
  houseId = house.accountId;
  sereno = house.gosinoId;

  const [second] = await db
    .insert(gosini)
    .values({ accountId: houseId, name: "Teso" })
    .returning({ id: gosini.id });
  if (second === undefined) throw new Error("no second exemplar");
  teso = second.id;

  // due giorni, due creature, due umori diversi — e due istantanee al giorno
  for (const daysAgo of [1, 2]) {
    await snapshot(sereno, daysAgo, 0.8, 0.2);
    await snapshot(sereno, daysAgo, 0.9, 0.2);
    await snapshot(teso, daysAgo, 0.2, 0.9);
    await snapshot(teso, daysAgo, 0.3, 0.9);
  }

  mood = new PackMood(db);
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

describe("le creature non si mescolano", () => {
  it("una serie per ognuna, con la sua media", async () => {
    const series = await mood.series(houseId, 14);
    expect(series).toHaveLength(2);

    const calmo = series.find((s) => s.id === sereno);
    const teseo = series.find((s) => s.id === teso);
    expect(calmo?.days).toHaveLength(2);
    // 0.8 e 0.9 nello stesso giorno fanno 0.85, non due punti a caso
    expect(calmo?.days[0]?.vars.umore).toBeCloseTo(0.85, 2);
    expect(teseo?.days[0]?.vars.umore).toBeCloseTo(0.25, 2);
    // e lo stress li separa nell'altro verso: non è una media di casa
    expect(teseo?.days[0]?.vars.stress).toBeCloseTo(0.9, 2);
    expect(calmo?.days[0]?.vars.stress).toBeCloseTo(0.2, 2);
  });

  it("i giorni sono in ordine, che è come si legge una storia", async () => {
    const series = await mood.series(houseId, 14);
    const days = series[0]?.days.map((d) => d.day) ?? [];
    expect([...days].sort()).toEqual(days);
  });

  it("la finestra taglia davvero: un giorno indietro non vede l'altro ieri", async () => {
    const series = await mood.series(houseId, 1);
    for (const creature of series) {
      expect(creature.days.length).toBeLessThanOrEqual(1);
    }
  });

  it("chi se n'è andato non ha un umore: ha una biografia", async () => {
    await db.update(gosini).set({ retiredAt: new Date() }).where(eq(gosini.id, teso));
    const series = await mood.series(houseId, 14);
    expect(series.map((s) => s.id)).not.toContain(teso);
    await db.update(gosini).set({ retiredAt: null }).where(eq(gosini.id, teso));
  });
});

describe("dalla rotta", () => {
  it("risponde con le creature della CASA, non del server", async () => {
    const other = await createAccount(db, MASTER_KEY, { slug: "vicina-branco", name: "Vicina" });
    const response = await app.inject({
      method: "GET",
      url: "/v1/psyche/branco?giorni=14",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ creatures: { id: string }[] }>();
    expect(body.creatures).toHaveLength(2);

    // e il vicino, che non ha ancora nessuna istantanea, vede il suo vuoto
    const theirs = await app.inject({
      method: "GET",
      url: "/v1/psyche/branco",
      headers: { authorization: `Bearer ${other.ownerToken}` },
    });
    expect(theirs.json<{ creatures: unknown[] }>().creatures).toHaveLength(0);
  });

  it("una finestra assurda si rifiuta invece di scaricare tutto", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/psyche/branco?giorni=9999",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });
});
