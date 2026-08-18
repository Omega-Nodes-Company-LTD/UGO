import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  auditLog,
  budgetLedger,
  checkins,
  createDbClient,
  desires,
  feedings,
  psycheSnapshots,
  rssFeeds,
  runMigrations,
  unknownPrints,
  type DbClient,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditLog } from "../../src/services/auditLog.js";
import { InitiativeSwitch } from "../../src/services/volition/initiativeSwitch.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { addBeing, createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-062, il modello: le rotte delle impronte attraversano il muro.
 *
 * Fin qui i test RLS provavano che il muro tiene (`packages/db`); questo prova
 * che **le rotte ci passano**. Il server è costruito sopra una connessione
 * `ugo_app` — il ruolo a cui le politiche si applicano davvero — e le rotte
 * convertite a `inAccount` rispondono i dati giusti. Se una query scappasse
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
      accountId: house,
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
  myToken = (await issueToken(owner, { accountId: mine.id, role: "owner", label: "mia" })).token;
  theirToken = (
    await issueToken(owner, { accountId: theirs.id, role: "owner", label: "loro" })
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
      // il lotto 1 (ADR-062): liste, domande, salvadanaio, umore del branco
      gosini: { dataKey: mine.dataKey },
      stats: { dailyBudgetUsd: 5, timezone: "Europe/Rome" },
      // lotto 3: la volontà si legge dal pannello
      initiative: new InitiativeSwitch(() => true),
      // lotto 4: i clienti della reception
      customers: { dataKey: mine.dataKey },
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
      .where(sql`${auditLog.accountId} = ${mine.id} and ${auditLog.verb} = 'print_destroyed'`);
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

  it("una query fuori da inAccount vede zero righe: il censimento funziona", async () => {
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
      .where(sql`${auditLog.verb} = 'denied' and ${auditLog.accountId} is null`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Lotto 1 della conversione (ADR-062): lo stato e i conti attraversano il
 * muro. Ogni caso pianta un dato in ENTRAMBE le case e pretende che ognuna
 * veda solo il suo — sotto `ugo_app`, dove una query fuori da `inAccount`
 * vedrebbe zero righe e il test lo direbbe.
 */
describe("lotto 1: lo stato e i conti come ugo_app", () => {
  it("le liste: si scrive e si legge dentro casa, il vicino non le vede", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/lists",
      headers: { authorization: `Bearer ${myToken}` },
      payload: { list: "spesa", text: "latte di soia" },
    });
    expect(made.statusCode).toBe(201);

    const mineView = await app.inject({
      method: "GET",
      url: "/v1/lists",
      headers: { authorization: `Bearer ${myToken}` },
    });
    const texts = mineView.json<{ items: { text: string }[] }>().items.map((i) => i.text);
    expect(texts).toContain("latte di soia");

    const theirView = await app.inject({
      method: "GET",
      url: "/v1/lists",
      headers: { authorization: `Bearer ${theirToken}` },
    });
    expect(theirView.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it("le domande che tornano: la lista è della casa, e il 404 del vicino non cancella", async () => {
    await owner.insert(checkins).values({ gosinoId: mine.gosinoId, question: "com'è andata?", hour: 21 });
    const [neighbour] = await owner
      .insert(checkins)
      .values({ gosinoId: theirs.gosinoId, question: "tutto bene?", hour: 9 })
      .returning({ id: checkins.id });
    if (neighbour === undefined) throw new Error("checkin non piantato");

    const mineView = await app.inject({
      method: "GET",
      url: "/v1/checkins",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(mineView.statusCode).toBe(200);
    const questions = mineView
      .json<{ checkins: { question: string }[] }>()
      .checkins.map((c) => c.question);
    expect(questions).toContain("com'è andata?");
    expect(questions).not.toContain("tutto bene?");

    // spegnere la domanda del vicino risponde «non esiste», e la riga resta
    const cross = await app.inject({
      method: "DELETE",
      url: `/v1/checkins/${neighbour.id}`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(cross.statusCode).toBe(404);
    const left = await owner
      .select({ id: checkins.id })
      .from(checkins)
      .where(sql`${checkins.id} = ${neighbour.id}`);
    expect(left).toHaveLength(1);
  });

  it("i feed: iscritti in casa mia, invisibili dal token del vicino", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/feeds",
      headers: { authorization: `Bearer ${myToken}` },
      payload: { url: "https://example.org/rss.xml", label: "esempio" },
    });
    expect(made.statusCode).toBe(201);

    const theirView = await app.inject({
      method: "GET",
      url: "/v1/feeds",
      headers: { authorization: `Bearer ${theirToken}` },
    });
    expect(theirView.json<{ feeds: unknown[] }>().feeds).toHaveLength(0);
    const rows = await owner
      .select({ id: rssFeeds.id })
      .from(rssFeeds)
      .where(sql`${rssFeeds.accountId} = ${mine.id}`);
    expect(rows).toHaveLength(1);
  });

  it("il salvadanaio: il saldo è della casa che guarda, e l'esemplare altrui è un 404", async () => {
    await owner.insert(feedings).values({
      accountId: mine.id,
      gosinoId: mine.gosinoId,
      kind: "lavoro",
      amountUsd: "2.500000",
    });

    const mineView = await app.inject({
      method: "GET",
      url: `/v1/gosini/${mine.gosinoId}/piggybank`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(mineView.statusCode).toBe(200);
    expect(mineView.json<{ fedUsd: number }>().fedUsd).toBeCloseTo(2.5, 6);

    const cross = await app.inject({
      method: "GET",
      url: `/v1/gosini/${mine.gosinoId}/piggybank`,
      headers: { authorization: `Bearer ${theirToken}` },
    });
    expect(cross.statusCode).toBe(404);
  });

  it("i conti: la spesa di oggi è solo la mia, non quella del vicinato", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    await owner.insert(budgetLedger).values([
      {
        accountId: mine.id,
        gosinoId: mine.gosinoId,
        date: today,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        tokensIn: 10,
        tokensOut: 10,
        costUsd: "0.110000",
      },
      {
        accountId: theirs.id,
        gosinoId: theirs.gosinoId,
        date: today,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        tokensIn: 10,
        tokensOut: 10,
        costUsd: "0.990000",
      },
    ]);

    const view = await app.inject({
      method: "GET",
      url: "/v1/stats",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(200);
    expect(view.json<{ budget: { spentUsd: number } }>().budget.spentUsd).toBeCloseTo(0.11, 6);
  });

  it("le stanze: il catalogo è della casa, e il vicino non vede la mia cucina", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { authorization: `Bearer ${myToken}` },
      payload: { name: "cucina-rls" },
    });
    expect([200, 201]).toContain(made.statusCode);

    const theirView = await app.inject({
      method: "GET",
      url: "/v1/rooms",
      headers: { authorization: `Bearer ${theirToken}` },
    });
    const names = theirView.json<{ rooms: { name: string }[] }>().rooms.map((r) => r.name);
    expect(names).not.toContain("cucina-rls");
  });

  it("la popolazione: l'elenco mostra le creature di casa e nessun'altra", async () => {
    const view = await app.inject({
      method: "GET",
      url: "/v1/gosini",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(200);
    const ids = view.json<{ gosini: { id: string }[] }>().gosini.map((g) => g.id);
    expect(ids).toContain(mine.gosinoId);
    expect(ids).not.toContain(theirs.gosinoId);
  });

  it("il pedigree del vicino è un 404, come una creatura che non esiste", async () => {
    const view = await app.inject({
      method: "GET",
      url: `/v1/gosini/${theirs.gosinoId}/pedigree`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(404);
  });

  it("la dote del vicino non si guarda, e la sua mortalità non si accetta", async () => {
    const preview = await app.inject({
      method: "POST",
      url: `/v1/gosini/${theirs.gosinoId}/dowry/preview`,
      headers: { authorization: `Bearer ${myToken}` },
      payload: {},
    });
    expect(preview.statusCode).toBe(404);

    const mortality = await app.inject({
      method: "POST",
      url: `/v1/gosini/${theirs.gosinoId}/mortality`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(mortality.statusCode).toBe(409);
  });

  it("l'umore del branco: una serie per creatura, e solo le creature di casa", async () => {
    await owner.insert(psycheSnapshots).values([
      { gosinoId: mine.gosinoId, vars: { energia: 0.5 }, label: "sereno" },
      { gosinoId: theirs.gosinoId, vars: { energia: 0.2 }, label: "stanco" },
    ]);

    const view = await app.inject({
      method: "GET",
      url: "/v1/psyche/branco",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(200);
    const ids = view.json<{ creatures: { id: string }[] }>().creatures.map((c) => c.id);
    expect(ids).toContain(mine.gosinoId);
    expect(ids).not.toContain(theirs.gosinoId);
  });
});

/**
 * Lotto 3: privacy, volontà e impostazioni della casa.
 */
describe("lotto 3: privacy e volontà come ugo_app", () => {
  it("«cosa sai di me» conta solo la mia casa, non il vicinato", async () => {
    await addBeing(owner, theirs, "Persona Del Vicino");
    const view = await app.inject({
      method: "GET",
      url: "/v1/privacy/summary",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(200);
    expect(view.json<{ beings: number }>().beings).toBe(0);

    const theirView = await app.inject({
      method: "GET",
      url: "/v1/privacy/summary",
      headers: { authorization: `Bearer ${theirToken}` },
    });
    expect(theirView.json<{ beings: number }>().beings).toBeGreaterThanOrEqual(1);
  });

  it("i desideri del vicino non compaiono nel mio pannello della volontà", async () => {
    await owner.insert(desires).values([
      { gosinoId: mine.gosinoId, status: "pending", kind: "desiderio", text: "voglio uscire" },
      { gosinoId: theirs.gosinoId, status: "pending", kind: "desiderio", text: "segreto del vicino" },
    ]);
    const view = await app.inject({
      method: "GET",
      url: "/v1/volition",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(200);
    const texts = view.json<{ desires: { text: string }[] }>().desires.map((d) => d.text);
    expect(texts).toContain("voglio uscire");
    expect(texts).not.toContain("segreto del vicino");
  });

  it("rinominare la casa rinomina LA MIA, e il vicino resta com'era", async () => {
    const done = await app.inject({
      method: "PATCH",
      url: "/v1/account",
      headers: { authorization: `Bearer ${myToken}` },
      payload: { name: "Casa Rinominata RLS" },
    });
    expect(done.statusCode).toBe(200);
    const rows = await owner
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(sql`${accounts.id} in (${mine.id}, ${theirs.id})`);
    const byId = new Map(rows.map((r) => [r.id, r.name]));
    expect(byId.get(mine.id)).toBe("Casa Rinominata RLS");
    expect(byId.get(theirs.id)).not.toBe("Casa Rinominata RLS");
  });
});

/**
 * Lotto 4: la reception — i clienti sono della casa che li ha.
 */
describe("lotto 4: i clienti come ugo_app", () => {
  it("un cliente creato in casa mia non compare nell'elenco del vicino", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${myToken}` },
      payload: { name: "Studio Rossi RLS" },
    });
    expect(made.statusCode).toBe(201);

    const theirView = await app.inject({
      method: "GET",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${theirToken}` },
    });
    const names = theirView.json<{ customers: { name: string }[] }>().customers.map((c) => c.name);
    expect(names).not.toContain("Studio Rossi RLS");

    const mineView = await app.inject({
      method: "GET",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(
      mineView.json<{ customers: { name: string }[] }>().customers.map((c) => c.name),
    ).toContain("Studio Rossi RLS");
  });

  it("il cliente del vicino è un 404 anche per le sue fonti", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${theirToken}` },
      payload: { name: "Cliente Del Vicino" },
    });
    expect(made.statusCode).toBe(201);
    const foreignId = made.json<{ id: string }>().id;

    const view = await app.inject({
      method: "GET",
      url: `/v1/customers/${foreignId}`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(view.statusCode).toBe(404);

    const sources = await app.inject({
      method: "GET",
      url: `/v1/customers/${foreignId}/sources`,
      headers: { authorization: `Bearer ${myToken}` },
    });
    expect(sources.statusCode).toBe(404);
  });
});
