import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  beings,
  createDbClient,
  gosini,
  memories,
  messages,
  plazaInvites,
  plazaPresence,
  runMigrations,
  withAccount,
  withPlaza,
  type DbClient,
} from "@ugo/db";
import { startLlmStub, startPostgres, type LlmStub } from "@ugo/factories";
import { ModelCatalog } from "@ugo/memory";
import { generateDataKey } from "@ugo/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { AiResolver } from "../../src/services/ai/resolver.js";
import { PlanGate } from "../../src/services/billing/plan.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-132 e ADR-020: la piazza e l'incontro di persona. Postgres vero, LLM su
 * uno stub di rete vero. Si prova quello che conta per il confine: ognuno
 * paga e tiene la sua copia, nessun ricordo di casa entra nel prompt, chi è
 * bloccato sparisce, chi è scaduto non c'è più.
 */

const MASTER = generateDataKey();
const SECRET_OF_HOUSE = "Zia Pina abita a Lucca";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
/** il ruolo applicativo, quello a cui le politiche si applicano davvero */
let appDb: DbClient;
let stub: LlmStub;
let app: FastifyInstance;
const houses: Record<"rosa" | "blu" | "gratis" | "muta", { house: TestHouse; token: string }> = {} as never;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  await db.execute(sql.raw("ALTER ROLE ugo_app LOGIN PASSWORD 'ugo-app-piazza'"));
  const appUrl = new URL(started.url);
  appUrl.username = "ugo_app";
  appUrl.password = "ugo-app-piazza";
  appDb = createDbClient(appUrl.toString());
  stub = await startLlmStub();
  for (const slug of ["rosa", "blu", "gratis", "muta"] as const) {
    const house = await createHouse(db, `casa-${slug}`, { masterKey: MASTER });
    const token = (await issueToken(db, { accountId: house.id, role: "owner", label: slug })).token;
    await db.update(gosini).set({ name: `Gosino ${slug}` }).where(eq(gosini.id, house.gosinoId));
    if (slug !== "gratis") await db.update(accounts).set({ planGrant: "pro" }).where(eq(accounts.id, house.id));
    houses[slug] = { house, token };
  }
  // un ricordo di casa che non deve uscire di casa
  await db.insert(memories).values({ gosinoId: houses.rosa.house.gosinoId, kind: "fact", text: SECRET_OF_HOUSE });

  const baseUrls = { anthropic: stub.baseUrl, openrouter: stub.baseUrl, openai: stub.baseUrl };
  const resolver = new AiResolver({
    db,
    dbFor: () => db,
    masterKey: MASTER,
    dailyBudgetUsd: 5,
    platform: {},
    baseUrls,
    credit: { markup: 1.3, usdToEur: 0.92 },
  });
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    ai: {
      masterKey: MASTER,
      resolver,
      catalog: new ModelCatalog({ openRouterBaseUrl: stub.baseUrl, anthropicBaseUrl: stub.baseUrl }),
      platform: {},
      baseUrls,
      dailyBudgetUsd: 5,
    },
    billing: { plans: new PlanGate("free"), masterKey: MASTER, marketFeePct: 10 },
    features: { chat: undefined as never, psyche: undefined as never, gosini: { dataKey: MASTER } },
  });
  await app.ready();
  // rosa e blu hanno una testa; muta no
  for (const slug of ["rosa", "blu"] as const) {
    const key = await call("PUT", "/v1/ai/chiavi/anthropic", slug, { secret: `sk-ant-${slug}-0001` });
    expect(key.statusCode).toBe(200);
    const choice = await call("PUT", "/v1/ai/scelte/chat", slug, { provider: "anthropic", model: "claude-haiku-4-5" });
    expect(choice.statusCode).toBe(204);
  }
}, 240_000);

afterAll(async () => {
  await app.close();
  await appDb.$client.end();
  await db.$client.end();
  await pg.stop();
  await stub.close();
});

type Who = keyof typeof houses;
function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, who: Who, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${houses[who].token}` },
    ...(payload !== undefined && { payload: payload as object }),
  });
}
const gosinoOf = (who: Who): string => houses[who].house.gosinoId;

interface Square {
  presenti: { handle: string; name: string }[];
  inviti: { id: string; verso: string; stato: string; turni: number; altro: string }[];
}
const square = async (who: Who): Promise<Square> => (await call("GET", "/v1/piazza", who)).json<Square>();

async function enter(who: Who): Promise<string> {
  const res = await call("POST", "/v1/piazza/presenza", who, { gosino: gosinoOf(who) });
  expect(res.statusCode).toBe(201);
  return res.json<{ handle: string }>().handle;
}

async function settled(who: Who, id: string): Promise<string> {
  for (let i = 0; i < 200; i += 1) {
    const found = (await square(who)).inviti.find((x) => x.id === id);
    if (found !== undefined && ["concluso", "interrotto"].includes(found.stato)) return found.stato;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("l'incontro non è finito");
}

describe("la piazza", () => {
  let rosaHandle = "";
  let inviteId = "";

  it("è del piano Pro: chi è Free non entra", async () => {
    const res = await call("POST", "/v1/piazza/presenza", "gratis", { gosino: gosinoOf("gratis") });
    expect(res.statusCode).toBe(402);
  });

  it("mostra chi c'è col suo handle, mai l'account né l'id del gosino", async () => {
    rosaHandle = await enter("rosa");
    const seen = await square("blu");
    expect(seen.presenti.map((p) => p.name)).toContain("Gosino rosa");
    const raw = JSON.stringify(seen);
    expect(raw).not.toContain(houses.rosa.house.id);
    expect(raw).not.toContain(gosinoOf("rosa"));
    // chi è in piazza non vede sé stesso
    expect((await square("rosa")).presenti).toHaveLength(0);
  });

  it("rientrare dà un handle nuovo: nessun filo fra un passaggio e l'altro", async () => {
    const again = await enter("rosa");
    expect(again).not.toBe(rosaHandle);
    rosaHandle = again;
  });

  it("per invitare bisogna essere in piazza; poi un incontro alla volta", async () => {
    const early = await call("POST", "/v1/piazza/inviti", "blu", { gosino: gosinoOf("blu"), a: rosaHandle });
    expect(early.statusCode).toBe(409);
    await enter("blu");
    const sent = await call("POST", "/v1/piazza/inviti", "blu", { gosino: gosinoOf("blu"), a: rosaHandle });
    expect(sent.statusCode).toBe(201);
    inviteId = sent.json<{ id: string }>().id;
    const twice = await call("POST", "/v1/piazza/inviti", "blu", { gosino: gosinoOf("blu"), a: rosaHandle });
    expect(twice.statusCode).toBe(409);
    const received = (await square("rosa")).inviti.find((x) => x.id === inviteId);
    expect(received).toMatchObject({ verso: "entrata", stato: "attesa", altro: "Gosino blu" });
  });

  it("accettato, gira da solo: ognuno paga le sue battute e tiene la sua copia cifrata", async () => {
    stub.nextResponse = { text: "Ciao! Piacere di conoscerti." };
    const before = stub.requests.length;
    const accepted = await call("POST", `/v1/piazza/inviti/${inviteId}/accetta`, "rosa");
    expect(accepted.statusCode).toBe(202);
    expect(await settled("rosa", inviteId)).toBe("concluso");

    const turns = stub.requests.slice(before).filter((r) => r.path === "/v1/messages");
    expect(turns).toHaveLength(6);
    // ognuno con la sua chiave: tre battute a testa
    const keys = turns.map((r) => String(r.headers["x-api-key"]));
    expect(keys.filter((k) => k.includes("blu"))).toHaveLength(3);
    expect(keys.filter((k) => k.includes("rosa"))).toHaveLength(3);
    // il confine sta a monte: la regola della piazza c'è, i ricordi di casa no
    expect(JSON.stringify(turns[0]?.body.system)).toContain("Sei in piazza");
    expect(JSON.stringify(turns.map((r) => r.body))).not.toContain(SECRET_OF_HOUSE);

    for (const who of ["rosa", "blu"] as const) {
      const rows = await db
        .select({ text: messages.text })
        .from(messages)
        .where(and(eq(messages.gosinoId, gosinoOf(who)), eq(messages.channel, "piazza")));
      expect(rows).toHaveLength(6);
      expect(rows.every((r) => !r.text.includes("Piacere"))).toBe(true);
      const lines = await call("GET", `/v1/piazza/inviti/${inviteId}/battute`, who);
      expect(lines.json<{ battute: { chi: string; testo: string }[] }>().battute).toHaveLength(6);
    }
  });

  it("dopo, l'altro è un visitatore del branco e resta un ricordo", async () => {
    const [visitor] = await db
      .select({ name: beings.displayName, kind: beings.kind })
      .from(beings)
      .where(and(eq(beings.accountId, houses.rosa.house.id), eq(beings.species, "gosino")));
    expect(visitor).toEqual({ name: "Gosino blu", kind: "visitor" });
    const episodes = await db
      .select({ text: memories.text })
      .from(memories)
      .where(and(eq(memories.gosinoId, gosinoOf("blu")), eq(memories.kind, "episode")));
    expect(episodes.map((e) => e.text).join()).toContain("Gosino rosa");
  });

  it("una casa senza testa interrompe, e la frase di ripiego non attraversa il confine", async () => {
    await enter("muta");
    const rosa = (await square("muta")).presenti.find((p) => p.name === "Gosino rosa");
    const sent = await call("POST", "/v1/piazza/inviti", "muta", { gosino: gosinoOf("muta"), a: rosa?.handle });
    expect(sent.statusCode).toBe(201);
    const id = sent.json<{ id: string }>().id;
    await call("POST", `/v1/piazza/inviti/${id}/accetta`, "rosa");
    expect(await settled("rosa", id)).toBe("interrotto");
    const stored = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(inArray(messages.gosinoId, [gosinoOf("muta"), gosinoOf("rosa")]), eq(messages.channel, "piazza")));
    // solo le sei battute dell'incontro di prima, tutte di rosa
    expect(stored).toHaveLength(6);
  });

  it("chi blocca non è più visto e non riceve più inviti", async () => {
    await enter("blu");
    const rosaNow = await enter("rosa");
    const sent = await call("POST", "/v1/piazza/inviti", "blu", { gosino: gosinoOf("blu"), a: rosaNow });
    expect(sent.statusCode).toBe(201);
    const blocked = await call("POST", `/v1/piazza/inviti/${sent.json<{ id: string }>().id}/blocca`, "rosa");
    expect(blocked.statusCode).toBe(200);
    expect((await square("blu")).presenti.map((p) => p.name)).not.toContain("Gosino rosa");
    expect((await square("rosa")).presenti.map((p) => p.name)).not.toContain("Gosino blu");
    const again = await call("POST", "/v1/piazza/inviti", "blu", { gosino: gosinoOf("blu"), a: rosaNow });
    expect(again.statusCode).toBe(404);
  });

  it("una presenza scaduta non c'è più", async () => {
    await db
      .update(plazaPresence)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(plazaPresence.gosinoId, gosinoOf("muta")));
    expect((await square("rosa")).presenti.map((p) => p.name)).not.toContain("Gosino muta");
  });

  it("le battute di un incontro sono solo delle due parti", async () => {
    const res = await call("GET", `/v1/piazza/inviti/${inviteId}/battute`, "muta");
    expect(res.statusCode).toBe(404);
  });
});

describe("l'incontro di persona (ADR-020)", () => {
  it("spento per default: niente biglietto", async () => {
    const res = await call("GET", `/v1/gosini/${gosinoOf("muta")}/biglietto`, "muta");
    expect(res.statusCode).toBe(409);
  });

  it("il biglietto inquadrato presenta l'altro; poi l'avvistamento lo saluta", async () => {
    for (const who of ["muta", "gratis"] as const) {
      expect((await call("PUT", `/v1/gosini/${gosinoOf(who)}/incontri`, who, { attivi: true })).statusCode).toBe(200);
    }
    const card = (await call("GET", `/v1/gosini/${gosinoOf("muta")}/biglietto`, "muta")).json<object>();
    const met = await call("POST", `/v1/gosini/${gosinoOf("gratis")}/presentazione`, "gratis", card);
    expect(met.statusCode).toBe(201);
    expect(met.json()).toMatchObject({ conosciuto: "Gosino muta" });

    const seen = (await call("GET", `/v1/gosini/${gosinoOf("muta")}/annuncio`, "muta")).json<{ nonce: string; tag: string }>();
    const greeted = await call("POST", "/v1/peer/avvistamento", "gratis", { gosino: gosinoOf("gratis"), ...seen });
    expect(greeted.json()).toEqual({ salutato: "Gosino muta" });
  });

  it("un biglietto manomesso non presenta nessuno", async () => {
    const card = (await call("GET", `/v1/gosini/${gosinoOf("muta")}/biglietto`, "muta")).json<{ card: { name: string } }>();
    card.card.name = "Impostore";
    const res = await call("POST", `/v1/gosini/${gosinoOf("gratis")}/presentazione`, "gratis", card);
    expect(res.statusCode).toBe(422);
  });

  it("dimenticare butta il segreto: l'avvistamento non saluta più", async () => {
    const known = (await call("GET", `/v1/gosini/${gosinoOf("gratis")}/conoscenze`, "gratis")).json<{
      conoscenze: { essere: string; nome: string }[];
    }>();
    const muta = known.conoscenze.find((k) => k.nome === "Gosino muta");
    expect(muta).toBeDefined();
    const gone = await call("DELETE", `/v1/gosini/${gosinoOf("gratis")}/conoscenze/${muta?.essere ?? ""}`, "gratis");
    expect(gone.statusCode).toBe(204);
    const seen = (await call("GET", `/v1/gosini/${gosinoOf("muta")}/annuncio`, "muta")).json<{ nonce: string; tag: string }>();
    const res = await call("POST", "/v1/peer/avvistamento", "gratis", { gosino: gosinoOf("gratis"), ...seen });
    expect(res.statusCode).toBe(204);
  });

  it("il gosino di un'altra casa non si tocca", async () => {
    const res = await call("PUT", `/v1/gosini/${gosinoOf("rosa")}/incontri`, "gratis", { attivi: true });
    expect(res.statusCode).toBe(404);
  });
});

describe("il muro, sotto ugo_app", () => {
  it("una casa vede solo le sue presenze; la piazza le vede tutte, e niente altro", async () => {
    await db.update(plazaPresence).set({ expiresAt: new Date(Date.now() + 600_000) });
    const own = await withAccount(appDb, houses.blu.house.id, (tx) => tx.select().from(plazaPresence));
    expect(own.every((row) => row.accountId === houses.blu.house.id)).toBe(true);
    const all = await withPlaza(appDb, (tx) => tx.select().from(plazaPresence));
    expect(new Set(all.map((row) => row.accountId)).size).toBeGreaterThan(1);
    // ugo_plaza guarda la piazza, non le case: i messaggi gli sono negati
    await expect(withPlaza(appDb, (tx) => tx.select().from(messages))).rejects.toThrow();
  });

  it("un invito si legge solo dalle due parti", async () => {
    const outsider = await withAccount(appDb, houses.gratis.house.id, (tx) => tx.select().from(plazaInvites));
    expect(outsider).toHaveLength(0);
    const party = await withAccount(appDb, houses.blu.house.id, (tx) => tx.select().from(plazaInvites));
    expect(party.length).toBeGreaterThan(0);
  });
});
