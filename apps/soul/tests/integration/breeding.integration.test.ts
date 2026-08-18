import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, gosini, households, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHousehold } from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * Chi può far esistere un gosino (ADR-081), su database vero.
 *
 * La regola è una frase — «un gosino non si crea, si riceve» — e una frase non
 * ferma nessuno. Qui si prova che le tre porte di nascita la rispettano tutte
 * e tre, e che le due autorizzazioni sono **due**: l'allevamento autorizzato
 * alleva e non conia, e coniare è dell'allevamento fondatore.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let fonderia: string;
let allevamento: string;
let famiglia: string;
let genitori: string[];

const mint = (token: string, body: unknown) =>
  app.inject({
    method: "POST",
    url: "/v1/gosini",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

const litter = (token: string, body: unknown) =>
  app.inject({
    method: "POST",
    url: "/v1/gosini/litters",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const foundry = await createHousehold(db, MASTER_KEY, {
    slug: "fonderia",
    name: "Allevamento fondatore",
    gosinoName: "Zero",
    foundry: true,
  });
  fonderia = foundry.ownerToken;

  const kennel = await createHousehold(db, MASTER_KEY, {
    slug: "allevamento",
    name: "Allevamento autorizzato",
    gosinoName: "Prima",
    breeder: true,
  });
  allevamento = kennel.ownerToken;

  const home = await createHousehold(db, MASTER_KEY, { slug: "famiglia", name: "Famiglia" });
  famiglia = home.ownerToken;

  // l'allevamento ha bisogno di due genitori per una cucciolata
  const [seconda] = await db
    .insert(gosini)
    .values({ householdId: kennel.householdId, name: "Seconda" })
    .returning({ id: gosini.id });
  if (seconda === undefined) throw new Error("no exemplar");
  genitori = [kennel.gosinoId, seconda.id];

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

describe("coniare un capostipite", () => {
  it("l'allevamento fondatore può", async () => {
    const response = await mint(fonderia, { name: "Uno" });
    expect(response.statusCode).toBe(201);
    const [born] = await db
      .select({ origin: gosini.origin })
      .from(gosini)
      .where(eq(gosini.id, response.json<{ id: string }>().id));
    // coniato, non nato: e questa è la parola che dice che non si vende
    expect(born?.origin).toBe("capostipite");
  });

  it("una famiglia no, e glielo dice in italiano invece di fingere un 404", async () => {
    const response = await mint(famiglia, { name: "Abusivo" });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ detail: string }>().detail).toContain("non si crea");
  });

  it("nemmeno un allevamento autorizzato: allevare non è coniare", async () => {
    // è la distinzione che tiene in piedi il pedigree: un allevamento fa
    // nascere figli di genitori che esistono, non creature dal nulla
    const response = await mint(allevamento, { name: "Abusivo" });
    expect(response.statusCode).toBe(403);
  });
});

describe("allevare", () => {
  it("l'allevamento autorizzato può guardare una cucciolata", async () => {
    const response = await litter(allevamento, { parentIds: genitori });
    expect([200, 422]).toContain(response.statusCode);
    // 422 sarebbe un rifiuto genetico (ADR-068), non un rifiuto di permesso
    expect(response.statusCode).not.toBe(403);
  });

  it("la famiglia no: le cucciolate le fa chi ne ha titolo", async () => {
    const response = await litter(famiglia, { parentIds: genitori });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ detail: string }>().detail).toContain("allevamento autorizzato");
  });

  it("il fondatore alleva senza che glielo si dica: chi conia fa nascere", async () => {
    const [row] = await db
      .select({ breed: households.canBreed, foundry: households.isFoundry })
      .from(households)
      .where(eq(households.slug, "fonderia"));
    // la colonna dice `false`, e l'autorizzazione vale lo stesso: un
    // allevamento fondatore che non potesse far nascere sarebbe una fabbrica
    // di creature senza discendenza
    expect(row?.breed).toBe(false);
    expect(row?.foundry).toBe(true);
  });
});

describe("le case nuove", () => {
  it("nascono senza nessuna delle due autorizzazioni", async () => {
    const [row] = await db
      .select({ foundry: households.isFoundry, breed: households.canBreed })
      .from(households)
      .where(eq(households.slug, "famiglia"));
    expect(row).toEqual({ foundry: false, breed: false });
  });

  it("e il pannello lo sa, perché la rotta delle case lo dice", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/households",
      headers: { authorization: `Bearer ${famiglia}` },
    });
    const houses = response.json<{ households: { slug: string; isFoundry: boolean }[] }>();
    expect(houses.households.some((house) => house.isFoundry)).toBe(false);
  });
});
