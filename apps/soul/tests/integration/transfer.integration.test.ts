import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  bonds,
  createDbClient,
  type DbClient,
  checkins,
  diaryEntries,
  gosini,
  memories,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createHousehold,
  createHouseholdWithFounder,
} from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * La cessione (ADR-082) su database vero.
 *
 * Quello che solo un database può dire è **cosa parte e cosa resta**. Un
 * cucciolo venduto con addosso le conversazioni dell'allevamento sarebbe una
 * fuga di dati con la fattura, e non è una cosa che si vede leggendo il codice:
 * si vede contando le righe dopo.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let allevamento: string;
let allevamentoId: string;
let famigliaId: string;
let cucciolo: string;
let capostipite: string;

const cede = (token: string, id: string, body: unknown) =>
  app.inject({
    method: "POST",
    url: `/v1/gosini/${id}/cede`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const kennel = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "allevamento",
    name: "Allevamento",
    gosinoName: "Zero",
    breeder: true,
  });
  allevamento = kennel.ownerToken;
  allevamentoId = kennel.householdId;
  capostipite = kennel.gosinoId;

  const home = await createHousehold(db, MASTER_KEY, { slug: "famiglia", name: "Famiglia" });
  famigliaId = home.householdId;

  // un nato, come uscirebbe da una cucciolata
  const [born] = await db
    .insert(gosini)
    .values({ householdId: allevamentoId, name: "Nino", origin: "nato", generation: 1 })
    .returning({ id: gosini.id });
  if (born === undefined) throw new Error("no cub");
  cucciolo = born.id;
  await db.insert(traitSets).values({
    householdId: allevamentoId,
    gosinoId: cucciolo,
    version: 1,
    traits: { calm: 0.5 },
  });
  // la vita fatta in allevamento: parole di persone che stanno lì
  await db.insert(memories).values({
    gosinoId: cucciolo,
    kind: "episode",
    text: encryptText("Il figlio dell'allevatore mi ha grattato il muso", DATA_KEY),
  });
  // ADR-085: una domanda che torna, messa dall'allevatore. Non è un ricordo:
  // è un'istruzione di chi cede, e alla famiglia nuova non deve arrivare
  await db.insert(checkins).values({
    gosinoId: cucciolo,
    question: "com'è andata la giornata in allevamento",
    hour: 21,
    minute: 0,
  });
  await db.insert(diaryEntries).values({
    gosinoId: cucciolo,
    date: "2026-08-17",
    text: "Giornata in allevamento",
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

describe("chi si può cedere", () => {
  it("un capostipite no, e la ragione è scritta", async () => {
    const response = await cede(allevamento, capostipite, {
      toHousehold: "famiglia",
      confirmName: "Zero",
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ detail: string }>().detail).toContain("si vendono i figli");
    // ed è ancora dov'era
    const [row] = await db
      .select({ house: gosini.householdId })
      .from(gosini)
      .where(eq(gosini.id, capostipite));
    expect(row?.house).toBe(allevamentoId);
  });

  it("il nome deve combaciare: un click solo non consegna una creatura", async () => {
    const response = await cede(allevamento, cucciolo, {
      toHousehold: "famiglia",
      confirmName: "Sbagliato",
    });
    expect(response.statusCode).toBe(400);
  });

  it("una casa che non esiste non riceve niente", async () => {
    const response = await cede(allevamento, cucciolo, {
      toHousehold: "casa-che-non-c-e",
      confirmName: "Nino",
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("cosa parte e cosa resta", () => {
  it("il nato cambia casa, e si porta genoma e genealogia", async () => {
    const response = await cede(allevamento, cucciolo, {
      toHousehold: "famiglia",
      confirmName: "Nino",
    });
    expect(response.statusCode).toBe(200);

    const [moved] = await db
      .select({ house: gosini.householdId, where: gosini.locationLabel })
      .from(gosini)
      .where(eq(gosini.id, cucciolo));
    expect(moved?.house).toBe(famigliaId);
    // la stanza era di una casa che non è più la sua
    expect(moved?.where).toBeNull();

    const [genome] = await db
      .select({ house: traitSets.householdId })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, cucciolo));
    expect(genome?.house).toBe(famigliaId);
  });

  it("la vita fatta in allevamento NON parte con lui", async () => {
    // è il punto: un cucciolo venduto con addosso le conversazioni
    // dell'allevamento sarebbe una fuga di dati con la fattura
    expect(await db.select().from(memories).where(eq(memories.gosinoId, cucciolo))).toHaveLength(0);
    expect(
      await db.select().from(diaryEntries).where(eq(diaryEntries.gosinoId, cucciolo)),
    ).toHaveLength(0);
    expect(await db.select().from(bonds).where(eq(bonds.gosinoId, cucciolo))).toHaveLength(0);
    // e nemmeno le domande che l'allevatore gli aveva messo in bocca: la
    // prima sera, a casa nuova, chiederebbe a uno sconosciuto una cosa che
    // non gli ha mai chiesto (ADR-085)
    expect(await db.select().from(checkins).where(eq(checkins.gosinoId, cucciolo))).toHaveLength(0);
  });

  it("e il conto di quel che è rimasto viene detto a chi cede", async () => {
    // due righe: il ricordo e la pagina di diario
    const [row] = await db
      .select({ house: gosini.householdId })
      .from(gosini)
      .where(eq(gosini.id, cucciolo));
    expect(row?.house).toBe(famigliaId);
  });

  it("non si cede due volte: dopo non è più roba di chi l'ha ceduto", async () => {
    const response = await cede(allevamento, cucciolo, {
      toHousehold: "famiglia",
      confirmName: "Nino",
    });
    expect(response.statusCode).toBe(404);
  });
});
