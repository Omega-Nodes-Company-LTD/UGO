import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  createDbClient,
  runMigrations,
  watchFinds,
  watches,
  withAccount,
  type DbClient,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText, generateDataKey } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { closeAccount } from "../../src/services/auth/closing.js";
import { PlanGate } from "../../src/services/billing/plan.js";
import { ExportService } from "../../src/services/privacy/exportService.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-133: le cose che segue, dal pannello. Postgres vero, e il muro provato
 * anche sotto `ugo_app`. Il sogno che le capisce e le cerca è provato in
 * `ops/jobs/tests/test_watches.py`; qui ciò che il proprietario vede e tocca.
 */

const MASTER = generateDataKey();
let pg: StartedPostgreSqlContainer;
let db: DbClient;
let appDb: DbClient;
let app: FastifyInstance;
const houses: Record<"mia" | "altra" | "gratis", { house: TestHouse; token: string }> = {} as never;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  await db.execute(sql.raw("ALTER ROLE ugo_app LOGIN PASSWORD 'ugo-app-segue'"));
  const appUrl = new URL(started.url);
  appUrl.username = "ugo_app";
  appUrl.password = "ugo-app-segue";
  appDb = createDbClient(appUrl.toString());
  for (const slug of ["mia", "altra", "gratis"] as const) {
    const house = await createHouse(db, `casa-segue-${slug}`, { masterKey: MASTER });
    const token = (await issueToken(db, { accountId: house.id, role: "owner", label: slug })).token;
    if (slug !== "gratis") await db.update(accounts).set({ planGrant: "pro" }).where(eq(accounts.id, house.id));
    houses[slug] = { house, token };
  }
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    billing: { plans: new PlanGate("free"), masterKey: MASTER, marketFeePct: 10 },
    features: { chat: undefined as never, psyche: undefined as never, gosini: { dataKey: MASTER } },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await appDb.$client.end();
  await db.$client.end();
  await pg.stop();
});

type Who = keyof typeof houses;
const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, who: Who, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${houses[who].token}` },
    ...(payload !== undefined && { payload: payload as object }),
  });

interface Seen {
  web: boolean;
  cose: { id: string; soggetto: string; tipo: string; fonte: string; stato: string }[];
  trovati: { titolo: string; link: string; frase: string; esito: string }[];
}
const seen = async (who: Who): Promise<Seen> => (await call("GET", "/v1/tieni-d-occhio", who)).json<Seen>();
const add = (who: Who, gosino: string) =>
  call("POST", "/v1/tieni-d-occhio", who, { gosino, soggetto: "il viaggio in Uganda a febbraio", tipo: "progetto", giorni: 120 });

let followed = "";

describe("le cose che segue", () => {
  it("stanno col sogno: chi è Free non ne aggiunge", async () => {
    expect((await add("gratis", houses.gratis.house.gosinoId)).statusCode).toBe(402);
  });

  it("chiedono quale gosino, e solo uno di casa", async () => {
    expect((await add("mia", houses.altra.house.gosinoId)).statusCode).toBe(404);
  });

  it("si aggiungono cifrate e si rileggono in chiaro solo dal padrone", async () => {
    const made = await add("mia", houses.mia.house.gosinoId);
    expect(made.statusCode).toBe(201);
    followed = made.json<{ id: string }>().id;
    const [row] = await db.select().from(watches).where(eq(watches.id, followed));
    expect(row?.subjectEnc).not.toContain("Uganda");
    expect(row?.embedding).toBeNull();
    const mine = await seen("mia");
    expect(mine.cose[0]).toMatchObject({ soggetto: "il viaggio in Uganda a febbraio", tipo: "progetto", fonte: "pannello", stato: "attivo" });
    expect((await seen("altra")).cose).toHaveLength(0);
  });

  it("mostra cosa ha trovato, col link", async () => {
    await db.insert(watchFinds).values({
      watchId: followed,
      accountId: houses.mia.house.id,
      gosinoId: houses.mia.house.gosinoId,
      urlHash: "h1",
      titleEnc: encryptText("Uganda, la Farnesina sconsiglia i viaggi", MASTER),
      linkEnc: encryptText("https://www.viaggiaresicuri.it/uganda", MASTER),
      lineEnc: encryptText("Ricordo che volevi andare in Uganda…", MASTER),
      verdict: "proposto",
    });
    expect((await seen("mia")).trovati[0]).toMatchObject({
      link: "https://www.viaggiaresicuri.it/uganda",
      frase: "Ricordo che volevi andare in Uganda…",
      esito: "proposto",
    });
  });

  it("la ricerca sul web è un interruttore della casa, spento per le case nuove", async () => {
    expect((await seen("mia")).web).toBe(false);
    expect((await call("PUT", "/v1/tieni-d-occhio/web", "mia", { attiva: true })).statusCode).toBe(200);
    expect((await seen("mia")).web).toBe(true);
    expect((await seen("altra")).web).toBe(false);
  });

  it("l'export le porta via in chiaro", async () => {
    const bundle = await withAccount(db, houses.mia.house.id, (tx) => new ExportService(tx, MASTER).exportAll(houses.mia.house.id));
    expect(JSON.stringify(bundle.watches)).toContain("il viaggio in Uganda a febbraio");
    expect(JSON.stringify(bundle.watches)).toContain("viaggiaresicuri.it");
  });

  it("sotto ugo_app, una casa non vede quelle dell'altra", async () => {
    const other = await withAccount(appDb, houses.altra.house.id, (tx) => tx.select().from(watches));
    expect(other).toHaveLength(0);
    const own = await withAccount(appDb, houses.mia.house.id, (tx) => tx.select().from(watchFinds));
    expect(own).toHaveLength(1);
  });

  it("dimenticare cancella davvero, trovati compresi; e non quella di un altro", async () => {
    expect((await call("DELETE", `/v1/tieni-d-occhio/${followed}`, "altra")).statusCode).toBe(404);
    expect((await call("DELETE", `/v1/tieni-d-occhio/${followed}`, "mia")).statusCode).toBe(204);
    expect(await db.select().from(watchFinds).where(eq(watchFinds.watchId, followed))).toHaveLength(0);
  });

  it("chiudere la casa le porta via", async () => {
    await add("mia", houses.mia.house.gosinoId);
    expect(await closeAccount(db, MASTER, houses.mia.house.id)).toBe(true);
    expect(await db.select().from(watches).where(eq(watches.accountId, houses.mia.house.id))).toHaveLength(0);
  });
});
