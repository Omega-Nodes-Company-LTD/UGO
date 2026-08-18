import { randomBytes } from "node:crypto";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  budgetLedger,
  createDbClient,
  type DbClient,
  desires,
  events,
  gosini,
  accounts,
  memories,
  PRIME_GOSINO_ID,
  relations,
  rooms,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { loadSpeciesMap } from "@ugo/shared";
import type { EmbeddingsClient, LocalTextClient } from "@ugo/memory";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GosinoRegistry } from "../../src/services/pack/runtimes.js";
import { InitiativeSwitch } from "../../src/services/volition/initiativeSwitch.js";
import { buildServer } from "../../src/server.js";
import { addBeing, createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * What /admin can actually see (ADR-034).
 *
 * The bug being fixed is silent, which is why these are worth their runtime:
 * `/v1/psyche` read the unscoped instance, so with two gosini it answered with
 * whichever had snapshotted last. Nothing threw. The panel simply showed a
 * mood belonging to nobody, and looked entirely plausible doing it.
 *
 * The model clients are stubbed at the object boundary because nothing here
 * calls them: what is under test is the scope of a query and the shape of a
 * reply, against a real database.
 */

const TOKEN = "operator-token";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let registry: GosinoRegistry;
let ugo: string;
let nino: string;
let accountId: string;

const idleEmbedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0))),
};
const idleLocal: LocalTextClient = {
  generate: () => Promise.resolve(undefined),
  available: () => Promise.resolve(false),
};

const get = (url: string) =>
  app.inject({ method: "GET", url, headers: { authorization: `Bearer ${TOKEN}` } });

beforeAll(async () => {
  const postgres = await startPostgres();
  pg = postgres.container;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);

  const houses = await db.select({ id: accounts.id }).from(accounts).limit(1);
  const found = houses[0]?.id;
  if (found === undefined) throw new Error("the migrations seed one account");
  accountId = found;
  const born = await db
    .insert(gosini)
    .values([
      { accountId: found, name: "Ugo", locationLabel: "cucina" },
      { accountId: found, name: "Nino", locationLabel: "studio" },
    ])
    .returning({ id: gosini.id });
  ugo = born[0]?.id ?? "";
  nino = born[1]?.id ?? "";
  // ADR-039: a label only means something if the room is in the catalogue —
  // which is the state the backfill migration leaves an existing house in
  await db.insert(rooms).values([
    { accountId: found, name: "cucina", slug: "cucina" },
    { accountId: found, name: "studio", slug: "studio" },
  ]);

  registry = await GosinoRegistry.load({
    db,
    embedder: idleEmbedder,
    // ADR-019 fase 2: `llm` e' una fabbrica per esemplare, non un client.
    // Qui era `undefined as never`, che compilava finche' il client veniva solo
    // conservato — e il giorno in cui ha cominciato a essere *chiamato* il cast
    // ha nascosto il cambio di firma al compilatore. Lo ha trovato la CI.
    llm: () => undefined as never,
    local: idleLocal,
    dataKey,
    timezone: "Europe/Rome",
    localModelUp: () => false,
    initiativeEnabled: () => true,
    hourOf: () => 15,
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: registry.resolve(undefined, accountId)?.psyche as never,
      registry,
      initiative: new InitiativeSwitch(() => true),
      stats: { dailyBudgetUsd: 0.5, timezone: "Europe/Rome" },
      // il branco su HTTP: senza `speciesMap` il server non registra affatto
      // /v1/pack, e la rotta assente risponde 404 come una casa non tua — due
      // 404 che si somigliano e vogliono dire cose diverse
      speciesMap: loadSpeciesMap(undefined),
      gosini: {},
      internalToken: TOKEN,
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("what the panel can see", () => {
  it("answers with the mood of the exemplar you asked for, not of whoever moved last", async () => {
    const ugoPsyche = registry.everywhere().find((r) => r.id === ugo)?.psyche;
    if (ugoPsyche === undefined) throw new Error("Ugo has no runtime");
    for (let i = 0; i < 3; i += 1) await ugoPsyche.applyEventType("loud_noise");

    const shaken = (await get(`/v1/psyche?gosino=${ugo}`)).json<{
      vars: { stress: number };
      who: { name: string };
    }>();
    const calm = (await get(`/v1/psyche?gosino=${nino}`)).json<{
      vars: { stress: number };
      who: { name: string };
    }>();

    expect(shaken.who.name).toBe("Ugo");
    expect(calm.who.name).toBe("Nino");
    expect(shaken.vars.stress).toBeGreaterThan(calm.vars.stress);
  });

  it("says what the stress is made of, and the parts agree with the bar", async () => {
    const body = (await get(`/v1/psyche?gosino=${ugo}`)).json<{
      vars: Record<string, number>;
      breakdown: Record<string, { baseline: number; value: number; causes: { cause: string }[] }>;
    }>();
    const stress = body.breakdown.stress;
    if (stress === undefined) throw new Error("no breakdown for stress");
    expect(stress.causes.map((c) => c.cause)).toContain("loud_noise");
    // the number under the bar has to be the number on the bar
    expect(stress.value).toBeCloseTo(body.vars.stress ?? -1, 10);
  });

  it("keeps one exemplar's initiatives out of the other's page", async () => {
    await db.insert(events).values([
      {
        gosinoId: ugo,
        source: "system",
        type: "initiative_taken",
        payload: { gosinoId: PRIME_GOSINO_ID, act: "nudge", driver: "loneliness", because: "è da un po' che non ci parliamo" },
      },
    ]);
    await db.insert(desires).values([
      { gosinoId: ugo, text: "domanda di Ugo?", status: "pending" },
      { gosinoId: nino, text: "domanda di Nino?", status: "pending" },
    ]);

    const his = (await get(`/v1/volition?gosino=${ugo}`)).json<{
      journal: { payload: { because?: string } }[];
      desires: { text: string }[];
    }>();
    expect(his.journal).toHaveLength(1);
    // the `because` is the whole point: an initiative you cannot explain is
    // indistinguishable from a glitch
    expect(his.journal[0]?.payload.because).toBe("è da un po' che non ci parliamo");
    expect(his.desires.map((d) => d.text)).toEqual(["domanda di Ugo?"]);

    const theirs = (await get(`/v1/volition?gosino=${nino}`)).json<{
      journal: unknown[];
      desires: { text: string }[];
    }>();
    expect(theirs.journal).toHaveLength(0);
    expect(theirs.desires.map((d) => d.text)).toEqual(["domanda di Nino?"]);
  });

  it("lets the owner stop him starting things, and hand the decision back", async () => {
    const flip = (enabled: boolean | null) =>
      app.inject({
        method: "POST",
        url: "/v1/volition/enabled",
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: { enabled },
      });

    const off = (await flip(false)).json<{ enabled: boolean; overridden: boolean }>();
    expect(off).toMatchObject({ enabled: false, overridden: true });

    const seen = (await get("/v1/volition")).json<{
      initiative: { enabled: boolean };
    }>();
    expect(seen.initiative.enabled).toBe(false);

    // null gives UGO_INITIATIVE the last word again
    const back = (await flip(null)).json<{ enabled: boolean; overridden: boolean }>();
    expect(back).toMatchObject({ enabled: true, overridden: false });
  });

  it("gives each his own 48-hour series, not the two of them interleaved", async () => {
    // The failure this catches is not "the wrong creature's history": it is a
    // CHIMERA. Both exemplars snapshot into one table, so an unscoped query
    // returns their moods interleaved as a single series, and the sparklines
    // draw steps nobody ever lived.
    const ugoPsyche = registry.everywhere().find((r) => r.id === ugo)?.psyche;
    const ninoPsyche = registry.everywhere().find((r) => r.id === nino)?.psyche;
    if (ugoPsyche === undefined || ninoPsyche === undefined) throw new Error("no runtime");
    await ugoPsyche.applyEventType("loud_noise");
    await ugoPsyche.snapshot();
    await ninoPsyche.applyEventType("went_out");
    await ninoPsyche.snapshot();

    const his = (await get(`/v1/stats?gosino=${ugo}`)).json<{
      mood: { vars: { stress: number; noia: number } }[];
    }>();
    const theirs = (await get(`/v1/stats?gosino=${nino}`)).json<{
      mood: { vars: { stress: number; noia: number } }[];
    }>();

    expect(his.mood.length).toBeGreaterThan(0);
    expect(theirs.mood.length).toBeGreaterThan(0);
    // Ugo has been startled and Nino has been out: no point of one series may
    // carry the other's signature
    expect(Math.max(...his.mood.map((m) => m.vars.stress))).toBeGreaterThan(
      Math.max(...theirs.mood.map((m) => m.vars.stress)),
    );
    expect(Math.min(...theirs.mood.map((m) => m.vars.noia))).toBeLessThan(
      Math.min(...his.mood.map((m) => m.vars.noia)),
    );

    // and unscoped still shows the whole house, which is the single-exemplar
    // reading and must not change
    const all = (await get("/v1/stats")).json<{ mood: unknown[] }>();
    expect(all.mood.length).toBeGreaterThanOrEqual(his.mood.length + theirs.mood.length);
  });

  it("moves one between rooms without costing him his mind", async () => {
    // The trap this catches: `reload()` used to SKIP an exemplar it already
    // held, so a move updated the database and left the registry pointing at
    // the old room — the dock kept showing the previous occupants. Rebuilding
    // him instead would have been the opposite mistake: a living psyche thrown
    // away to change a label.
    const before = registry.everywhere().find((r) => r.id === nino)?.psyche;
    if (before === undefined) throw new Error("no runtime");
    await before.applyEventType("loud_noise");
    // lo stress DECADE col tempo reale: le due letture vanno fatte allo stesso
    // istante congelato, o il confronto misura quanto è lento il runner invece
    // che se la psiche è sopravvissuta al trasloco — su una CI carica gli 85 ms
    // fra qui e l'ultima expect valevano già più della tolleranza
    const at = new Date();
    const rattled = before.current(at).vars.stress;

    const moved = await app.inject({
      method: "PATCH",
      url: `/v1/gosini/${nino}`,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { locationLabel: "cucina" },
    });
    expect(moved.statusCode).toBe(200);

    // the registry knows, so the kitchen dock now shows two
    expect(registry.inRoom("cucina", accountId).map((r) => r.name).sort()).toEqual(["Nino", "Ugo"]);
    expect(registry.inRoom("studio", accountId)).toHaveLength(0);
    // matching is forgiving: the label is typed by a person twice
    expect(registry.inRoom("  CUCINA ", accountId)).toHaveLength(2);

    // and he is the same creature: same object, same stress, nothing rebuilt
    const after = registry.everywhere().find((r) => r.id === nino)?.psyche;
    expect(after).toBe(before);
    expect(after?.current(at).vars.stress).toBeCloseTo(rattled, 5);
  });

  it("takes him out of every room when the label is emptied", async () => {
    await app.inject({
      method: "PATCH",
      url: `/v1/gosini/${nino}`,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { locationLabel: "" },
    });
    expect(registry.inRoom("cucina", accountId).map((r) => r.name)).toEqual(["Ugo"]);
    expect(registry.rooms(accountId).flatMap((r) => r.gosini.map((g) => g.name))).not.toContain("Nino");
  });

  it("refuses to show any of it without the token", async () => {
    const naked = await app.inject({ method: "GET", url: "/v1/volition" });
    expect(naked.statusCode).toBe(401);
  });
});

/**
 * ADR-019 phase 2, and the reason the whole commit exists: the panel used to
 * read the *database*, not the house. Every assertion below is a pair — what
 * is mine is there, what is theirs is not — because a scoped query that
 * returns nothing at all would pass a one-sided test.
 *
 * Last in the file on purpose: from the moment a second family exists, an
 * operator has to say which house it means, and every test above relies on
 * there being only one.
 */
describe("il pannello guarda una casa sola", () => {
  let vicini: TestHouse;
  let loroBeing: string;
  const mine = (url: string) =>
    get(url.includes("?") ? `${url}&casa=${accountId}` : `${url}?account=${accountId}`);
  const theirs = (url: string) =>
    get(url.includes("?") ? `${url}&casa=${vicini.id}` : `${url}?account=${vicini.id}`);

  beforeAll(async () => {
    vicini = await createHouse(db, "casa-vicini-pannello", { name: "i vicini" });
    loroBeing = await addBeing(db, vicini, "Persona Dei Vicini");
    await db.insert(beings).values({ accountId, displayName: "Persona Nostra" });
    await db.insert(memories).values([
      { gosinoId: vicini.gosinoId, kind: "fact", text: "i vicini hanno un gatto", importance: 0.5 },
      { gosinoId: ugo, kind: "fact", text: "noi abbiamo una lavatrice rotta", importance: 0.5 },
    ]);
    await db.insert(budgetLedger).values([
      {
        accountId: vicini.id,
        gosinoId: vicini.gosinoId,
        date: "2026-01-20",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        costUsd: "9.000000",
      },
    ]);
    await db.insert(relations).values({
      accountId: vicini.id,
      beingA: loroBeing,
      beingB: await addBeing(db, vicini, "Altro Vicino"),
      type: "cares_for",
    });
  });

  it("counts the memories of this house and not of the street", async () => {
    const ours = (await mine("/v1/stats")).json<{ counts: { memories: number } }>();
    const them = (await theirs("/v1/stats")).json<{ counts: { memories: number } }>();
    expect(ours.counts.memories).toBeGreaterThan(0);
    expect(them.counts.memories).toBe(1);
    // nine dollars next door must not appear on our bill
    expect((await mine("/v1/stats")).body).not.toContain("9.0");
  });

  it("lists our pack, our creatures and our relations — never theirs", async () => {
    const pack = (await mine("/v1/pack")).body;
    expect(pack).toContain("Persona Nostra");
    expect(pack).not.toContain("Persona Dei Vicini");

    const creatures = (await mine("/v1/gosini")).body;
    expect(creatures).toContain("Ugo");
    expect(creatures).not.toContain(vicini.gosinoId);

    expect((await mine("/v1/relations")).body).not.toContain(loroBeing);
    expect((await theirs("/v1/relations")).body).toContain(loroBeing);
  });

  it("keeps the archive and the graph on this side of the fence", async () => {
    const archive = (await mine("/v1/memories")).body;
    expect(archive).toContain("lavatrice");
    expect(archive).not.toContain("gatto");

    const graph = (await mine("/v1/memories/graph")).body;
    expect(graph).not.toContain(loroBeing);
    expect(graph).not.toContain(vicini.gosinoId);
  });

  it("stops guessing once there is more than one house", async () => {
    // the same request answered 200 while a single family lived here
    expect((await get("/v1/stats")).statusCode).toBe(400);
    expect((await get(`/v1/stats?account=${crypto.randomUUID()}`)).statusCode).toBe(404);
  });
});
