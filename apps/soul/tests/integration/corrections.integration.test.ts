import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  corrections,
  createDbClient,
  type DbClient,
  gosini,
  households,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { loadSpeciesMap } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";

/**
 * Una correzione è **per una creatura** (ADR-053).
 *
 * `POST /v1/corrections` scriveva sempre su `eldestExemplarOf(householdId)`, e
 * non era un ripiego innocuo: `corrections` è per esemplare e finisce nel
 * prompt di quella creatura — «ti hanno detto che parli troppo forte». Con due
 * gosini in casa, dire a Silvio che urla correggeva Ugo: Silvio continuava a
 * urlare e Ugo si scusava per una cosa che non aveva fatto. Nessun errore,
 * nessun log, la creatura sbagliata che cambia comportamento.
 *
 * Serve un test di integrazione e non uno di unità perché la parte che si
 * rompeva è **la riga scritta nel database**, e l'unica cosa che la dimostra è
 * guardarla.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let token = "";
let house = "";
let ugo = "";
let silvio = "";
let marco = "";

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);

  const [born] = await db
    .insert(households)
    .values({ slug: "casa-due", name: "Due" })
    .returning({ id: households.id });
  house = born?.id ?? "";
  const family = await db
    .insert(gosini)
    .values([
      { householdId: house, name: "ugo", bornAt: new Date("2026-01-01") },
      { householdId: house, name: "silvio", bornAt: new Date("2026-06-01") },
    ])
    .returning({ id: gosini.id, name: gosini.name });
  ugo = family.find((g) => g.name === "ugo")?.id ?? "";
  silvio = family.find((g) => g.name === "silvio")?.id ?? "";
  const [person] = await db
    .insert(beings)
    .values({ householdId: house, displayName: "Marco" })
    .returning({ id: beings.id });
  marco = person?.id ?? "";

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      speciesMap: loadSpeciesMap(undefined),
      // il registro è ciò che sa risolvere «silvio» in un id: senza, la rotta
      // non ha modo di sapere a quale delle due si sta parlando
      registry: {
        resolve: (query: string | undefined) =>
          query === "silvio" ? { id: silvio } : query === "ugo" ? { id: ugo } : undefined,
      } as never,
    },
  });
  await app.ready();
  token = (await issueToken(db, { householdId: house, role: "owner", label: "prova" })).token;
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await container.stop();
});

const correct = async (query: string) =>
  app.inject({
    method: "POST",
    url: `/v1/corrections${query}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { aboutBeing: marco, signal: "too_loud" },
  });

describe("POST /v1/corrections", () => {
  it("lands on the creature you actually told, not on the eldest", async () => {
    const response = await correct("?gosino=silvio");
    expect(response.statusCode).toBe(201);

    const rows = await db.select().from(corrections).where(eq(corrections.gosinoId, silvio));
    expect(rows).toHaveLength(1);
    // e il più anziano non ha ricevuto niente: è precisamente la riga che
    // prima veniva scritta e che faceva scusare la creatura sbagliata
    const eldest = await db.select().from(corrections).where(eq(corrections.gosinoId, ugo));
    expect(eldest).toHaveLength(0);
  });

  /**
   * Il rifiuto è la parte importante. Con più di un esemplare, **non si tira a
   * indovinare**: è la stessa regola che il prompt applica ai nomi delle
   * persone («non tirare a indovinare chi sia»), applicata a una scrittura.
   */
  it("refuses to guess when the house has more than one and nobody was named", async () => {
    const response = await correct("");
    expect(response.statusCode).toBe(400);
    expect(response.json<{ detail?: string }>().detail).toContain("più di un gosino");
  });

  it("says which one it wrote to, so the panel can show it", async () => {
    const response = await correct("?gosino=ugo");
    expect(response.json<{ gosinoId?: string }>().gosinoId).toBe(ugo);
  });
});

describe("una casa con un esemplare solo", () => {
  /**
   * ADR-019 §107: chi ha una creatura sola non deve vedere alcun cambiamento.
   * Una domanda che ha una risposta sola non è una domanda.
   */
  it("does not ask a question that has only one answer", async () => {
    const [alone] = await db
      .insert(households)
      .values({ slug: "casa-sola", name: "Sola" })
      .returning({ id: households.id });
    const only = await db
      .insert(gosini)
      .values({ householdId: alone?.id ?? "", name: "solo" })
      .returning({ id: gosini.id });
    const soloToken = (
      await issueToken(db, { householdId: alone?.id ?? "", role: "owner", label: "sola" })
    ).token;

    const response = await app.inject({
      method: "POST",
      url: "/v1/corrections",
      headers: { authorization: `Bearer ${soloToken}` },
      payload: { signal: "good" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ gosinoId?: string }>().gosinoId).toBe(only[0]?.id);
  });
});
