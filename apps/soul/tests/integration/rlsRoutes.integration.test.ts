import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  auditLog,
  createDbClient,
  runMigrations,
  unknownPrints,
  type DbClient,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditLog } from "../../src/services/auditLog.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-062, il modello: le rotte delle impronte attraversano il muro.
 *
 * Fin qui i test RLS provavano che il muro tiene (`packages/db`); questo prova
 * che **le rotte ci passano**. Il server è costruito sopra una connessione
 * `ugo_app` — il ruolo a cui le politiche si applicano davvero — e le rotte
 * convertite a `inHousehold` rispondono i dati giusti. Se una query scappasse
 * dalla transazione che dichiara la casa, qui vedrebbe zero righe e il test
 * lo direbbe: è il censimento automatico delle query orfane che ADR-062 §3
 * promette.
 */

const APP_PASSWORD = "ugo-app-route-test";

let container: StartedPostgreSqlContainer;
/** owner: migrazioni e semina */
let owner: DbClient;
/** il ruolo applicativo: quello su cui il server gira in questo test */
let appDb: DbClient;
let app: FastifyInstance;
let mine: TestHouse;
let theirs: TestHouse;
let myToken = "";
let theirToken = "";

async function plantPrint(house: string, daysOld: number): Promise<string> {
  const [row] = await owner
    .insert(unknownPrints)
    .values({
      householdId: house,
      modality: "face",
      model: "arcface-r50",
      dimensions: 4,
      payload: Buffer.from("ciphertext-finto"),
      lastSeenAt: new Date(Date.now() - daysOld * 86_400_000),
    })
    .returning({ id: unknownPrints.id });
  if (row === undefined) throw new Error("print insert failed");
  return row.id;
}

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  owner = createDbClient(pg.url);
  await owner.execute(sql.raw(`ALTER ROLE ugo_app LOGIN PASSWORD '${APP_PASSWORD}'`));
  const appUrl = new URL(pg.url);
  appUrl.username = "ugo_app";
  appUrl.password = APP_PASSWORD;
  appDb = createDbClient(appUrl.toString());

  mine = await createHouse(owner, "casa-rls-rotte");
  theirs = await createHouse(owner, "casa-rls-vicini");
  myToken = (await issueToken(owner, { householdId: mine.id, role: "owner", label: "mia" })).token;
  theirToken = (
    await issueToken(owner, { householdId: theirs.id, role: "owner", label: "loro" })
  ).token;

  // il server INTERO gira come `ugo_app`: rotte, guard, audit
  app = buildServer({
    db: appDb,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
    },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await appDb.$client.end();
  await owner.$client.end();
  await container.stop();
});

describe("le rotte delle impronte come ugo_app (ADR-062)", () => {
  it("la lista attraversa il muro e mostra SOLO la mia casa", async () => {
    const visible = await plantPrint(mine.id, 1);
    const invisible = await plantPrint(theirs.id, 1);

    const response = await app.inject({
      method: "GET",
      url: "/v1/prints/unknown",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json<{ prints: { id: string }[] }>().prints.map((p) => p.id);
    expect(ids).toContain(visible);
    expect(ids).not.toContain(invisible);

    // e il vicino, con il SUO token, vede la sua e non la mia
    const neighbour = await app.inject({
      method: "GET",
      url: "/v1/prints/unknown",
      headers: { authorization: `Bearer ${theirToken}` },
    });
    const theirIds = neighbour.json<{ prints: { id: string }[] }>().prints.map((p) => p.id);
    expect(theirIds).toContain(invisible);
    expect(theirIds).not.toContain(visible);
  });

  it("cancellare scrive il giornale DENTRO la casa dichiarata", async () => {
    const printId = await plantPrint(mine.id, 1);
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/prints/${printId}`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ destroyed: 1 });
    // la riga di giornale è passata dal WITH CHECK di audit_log: sotto
    // ugo_app ci riesce solo la transazione che ha dichiarato la casa
    const rows = await owner
      .select({ resourceId: auditLog.resourceId })
      .from(auditLog)
      .where(sql`${auditLog.householdId} = ${mine.id} and ${auditLog.verb} = 'print_destroyed'`);
    expect(rows.map((r) => r.resourceId)).toContain(printId);
  });

  it("la scadenza espelle le mie vecchie e non tocca MAI il vicino", async () => {
    const stale = await plantPrint(mine.id, 40);
    const neighbourStale = await plantPrint(theirs.id, 90);

    const response = await app.inject({
      method: "POST",
      url: "/v1/prints/expire",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ destroyed: number }>().destroyed).toBeGreaterThanOrEqual(1);

    const left = await owner
      .select({ id: unknownPrints.id })
      .from(unknownPrints)
      .where(sql`${unknownPrints.id} in (${stale}, ${neighbourStale})`);
    expect(left.map((r) => r.id)).toEqual([neighbourStale]);
  });

  it("una query fuori da inHousehold vede zero righe: il censimento funziona", async () => {
    await plantPrint(mine.id, 1);
    // la stessa select della rotta, ma sulla connessione nuda: nessuna casa
    // dichiarata, quindi il muro risponde zero — non i dati del più fortunato
    const naked = await appDb.select({ id: unknownPrints.id }).from(unknownPrints);
    expect(naked).toHaveLength(0);
  });

  it("il guard scrive il rifiuto nel giornale anche sotto ugo_app", async () => {
    // un 401 non appartiene a nessuna casa: la policy accetta il nullo, ed è
    // il caso che dimostra che l'audit fuori scope resta possibile quando
    // DEVE esserlo
    const audit = createAuditLog(appDb);
    await audit.record({ verb: "denied", outcome: "denied", resourceType: "route" });
    const rows = await owner
      .select({ verb: auditLog.verb })
      .from(auditLog)
      .where(sql`${auditLog.verb} = 'denied' and ${auditLog.householdId} is null`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
