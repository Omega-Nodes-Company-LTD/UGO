import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  desires,
  events,
  gosini,
  households,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import type { EmbeddingsClient, LocalTextClient } from "@ugo/memory";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GosinoRegistry } from "../../src/services/pack/runtimes.js";
import { InitiativeSwitch } from "../../src/services/volition/initiativeSwitch.js";
import { buildServer } from "../../src/server.js";

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
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());

  const houses = await db.select({ id: households.id }).from(households).limit(1);
  const householdId = houses[0]?.id;
  if (householdId === undefined) throw new Error("the migrations seed one household");
  const born = await db
    .insert(gosini)
    .values([
      { householdId, name: "Ugo", locationLabel: "cucina" },
      { householdId, name: "Nino", locationLabel: "studio" },
    ])
    .returning({ id: gosini.id });
  ugo = born[0]?.id ?? "";
  nino = born[1]?.id ?? "";

  registry = await GosinoRegistry.load({
    db,
    embedder: idleEmbedder,
    llm: undefined as never,
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
      psyche: registry.resolve(undefined)?.psyche as never,
      registry,
      initiative: new InitiativeSwitch(() => true),
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
    const ugoPsyche = registry.all().find((r) => r.id === ugo)?.psyche;
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
        payload: { act: "nudge", driver: "loneliness", because: "è da un po' che non ci parliamo" },
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

  it("refuses to show any of it without the token", async () => {
    const naked = await app.inject({ method: "GET", url: "/v1/volition" });
    expect(naked.statusCode).toBe(401);
  });
});
