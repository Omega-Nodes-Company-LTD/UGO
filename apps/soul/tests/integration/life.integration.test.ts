import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, gosini, runMigrations, traitSets } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHousehold } from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * L'arco della vita arriva fino all'API (ADR-071).
 *
 * L'età non si conserva: si CALCOLA da `born_at` e dal gene della longevità.
 * Quello che solo un database vero può dire è che il calcolo attraversi
 * davvero il giro — un genoma vecchio senza il gene non deve far esplodere
 * niente, e due creature nate in giorni diversi non devono avere la stessa età.
 */

const MASTER_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let token: string;

interface Listed {
  name: string;
  age: { days: number; stage: string; fraction: number; plasticity: number; greying: number };
}

const list = async (): Promise<Listed[]> => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/gosini",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ gosini: Listed[] }>().gosini;
};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createHousehold(db, MASTER_KEY, { slug: "casa-eta", name: "Età" });
  token = house.ownerToken;

  const born = async (name: string, daysAgo: number, traits: object): Promise<void> => {
    const [row] = await db
      .insert(gosini)
      .values({ householdId: house.householdId, name })
      .returning({ id: gosini.id });
    if (row === undefined) throw new Error("no exemplar");
    await db.execute(
      sql`update gosini set born_at = now() - make_interval(days => ${daysAgo}) where id = ${row.id}`,
    );
    await db.insert(traitSets).values({
      householdId: house.householdId,
      gosinoId: row.id,
      version: 1,
      traits,
    });
  };

  await born("Cucciolo", 3, { calm: 0.5, longevity: 0.5 });
  await born("Vecchio", 1300, { calm: 0.5, longevity: 0.5 });
  // un genoma di prima di ADR-071: nessun gene della longevità
  await born("Antico", 200, { calm: 0.5 });

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

describe("GET /v1/gosini porta l'età", () => {
  it("un cucciolo di tre giorni è un cucciolo, e cambia in fretta", async () => {
    const cub = (await list()).find((g) => g.name === "Cucciolo");
    expect(cub?.age.days).toBe(3);
    expect(cub?.age.stage).toBe("cucciolo");
    expect(cub?.age.plasticity).toBeGreaterThan(2);
    expect(cub?.age.greying).toBe(0);
  });

  it("un anziano ha finito di diventare sé stesso, ed è ingrigito", async () => {
    const elder = (await list()).find((g) => g.name === "Vecchio");
    expect(elder?.age.stage).toBe("anziano");
    expect(elder?.age.greying).toBeGreaterThan(0.8);
    // la differenza che conta: quanto la vita può ancora riscriverlo
    const cub = (await list()).find((g) => g.name === "Cucciolo");
    expect(elder?.age.plasticity).toBeLessThan((cub?.age.plasticity ?? 9) / 5);
  });

  it("l'anziano non è fermo: impara poco, non niente", async () => {
    const elder = (await list()).find((g) => g.name === "Vecchio");
    expect(elder?.age.plasticity).toBeGreaterThan(0);
  });

  it("un genoma senza il gene della longevità vive nella media, e non rompe niente", async () => {
    const old = (await list()).find((g) => g.name === "Antico");
    expect(old?.age.days).toBe(200);
    expect(old?.age.stage).toBe("adulto");
    expect(Number.isFinite(old?.age.fraction)).toBe(true);
  });
});
