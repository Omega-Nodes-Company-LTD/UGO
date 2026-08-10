import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, events, beings, runMigrations, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertProductionSecrets, soulEnvSchema } from "../../src/config/env.js";
import { ExportService } from "../../src/services/privacy/exportService.js";
import { ForgetService } from "../../src/services/privacy/forgetService.js";
import { buildServer } from "../../src/server.js";

// Real server, real database: the guard is exercised over the actual HTTP
// stack, including the 401 body shape and the audit trail it must not break.

const TOKEN = "s3cret-operator-token";
const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let guarded: FastifyInstance;
let open: FastifyInstance;

function build(token: string | undefined): FastifyInstance {
  return buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never, // unused by the routes under test
      psyche: undefined as never,
      privacy: { forget: new ForgetService({ db, dataKey }), exporter: new ExportService(db, dataKey) },
      stats: { dailyBudgetUsd: 0.5, timezone: "Europe/Rome" },
      ...(token !== undefined && { internalToken: token }),
    },
  });
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  guarded = build(TOKEN);
  open = build(undefined);
});

afterAll(async () => {
  await Promise.all([guarded.close(), open.close()]);
  await db.$client.end();
  await pg.stop();
});

const PROTECTED: { method: "POST" | "GET"; url: string; payload: Record<string, unknown> }[] = [
  {
    method: "POST",
    url: "/v1/privacy/forget",
    payload: { beingId: crypto.randomUUID(), confirm: true },
  },
  { method: "GET", url: "/v1/privacy/export", payload: {} },
  { method: "POST", url: "/v1/jobs/dream", payload: {} },
];

describe("internal token guard", () => {
  it("refuses protected routes without a token", async () => {
    for (const { method, url, payload } of PROTECTED) {
      const response = await guarded.inject({ method, url, payload });
      expect(response.statusCode, url).toBe(401);
      expect(response.headers["content-type"]).toContain("application/problem+json");
    }
  });

  it("refuses a wrong token and a malformed header alike", async () => {
    for (const authorization of ["Bearer sbagliato", "Bearer ", TOKEN, "Basic " + TOKEN]) {
      const response = await guarded.inject({
        method: "GET",
        url: "/v1/privacy/export",
        headers: { authorization },
      });
      expect(response.statusCode, authorization).toBe(401);
    }
  });

  it("lets the right token through", async () => {
    const response = await guarded.inject({
      method: "GET",
      url: "/v1/privacy/export",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain("ugo-export.json");
  });

  it("never echoes the expected secret in a rejection", async () => {
    const response = await guarded.inject({
      method: "GET",
      url: "/v1/privacy/export",
      headers: { authorization: "Bearer tentativo" },
    });
    expect(response.body).not.toContain(TOKEN);
    expect(response.body).not.toContain("tentativo");
  });

  it("stays open in development, where no token is configured", async () => {
    const response = await open.inject({ method: "GET", url: "/v1/privacy/export" });
    expect(response.statusCode).toBe(200);
  });
});

describe("production boot refuses to run unguarded", () => {
  const base = {
    DATABASE_URL: "postgres://ugo:x@db:5432/ugo",
    MQTT_URL: "mqtt://mosquitto:1883",
    MQTT_USER: "soul",
    MQTT_PASS: "x",
    OLLAMA_URL: "http://ollama:11434",
    ANTHROPIC_API_KEY: "k",
    UGO_DATA_KEY: "k",
  };

  it("throws when NODE_ENV=production and the token is missing", () => {
    const env = soulEnvSchema.parse({ ...base, NODE_ENV: "production" });
    expect(() => {
      assertProductionSecrets(env);
    }).toThrow(/UGO_INTERNAL_TOKEN/);
  });

  it("accepts production with a token, and development without", () => {
    expect(() => {
      assertProductionSecrets(
        soulEnvSchema.parse({ ...base, NODE_ENV: "production", UGO_INTERNAL_TOKEN: "t" }),
      );
    }).not.toThrow();
    expect(() => {
      assertProductionSecrets(soulEnvSchema.parse(base));
    }).not.toThrow();
  });
});

describe("POST /v1/jobs/dream (§5.7)", () => {
  it("records the request and reports honestly that it is queued", async () => {
    const response = await guarded.inject({
      method: "POST",
      url: "/v1/jobs/dream",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { date: "2026-08-08" },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json<{ status: string }>().status).toBe("recorded");

    const rows = await db.select().from(events).where(eq(events.type, "dream_requested"));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]?.payload)).toContain("2026-08-08");
  });
});

describe("erasure over HTTP", () => {
  it("requires explicit confirmation and reports a real result", async () => {
    const [person] = await db
      .insert(beings)
      .values({ displayName: "Test Persona", aliases: [] })
      .returning({ id: beings.id });
    if (person === undefined) throw new Error("insert failed");

    const unconfirmed = await guarded.inject({
      method: "POST",
      url: "/v1/privacy/forget",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { beingId: person.id },
    });
    expect(unconfirmed.statusCode).toBe(400);

    const confirmed = await guarded.inject({
      method: "POST",
      url: "/v1/privacy/forget",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { beingId: person.id, confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json<{ beingId: string }>().beingId).toBe(person.id);
    expect(await db.select().from(beings).where(eq(beings.id, person.id))).toHaveLength(0);
  });

  it("404s on an unknown person", async () => {
    const response = await guarded.inject({
      method: "POST",
      url: "/v1/privacy/forget",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { beingId: crypto.randomUUID(), confirm: true },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /v1/stats", () => {
  it("reports spend, cache-hit ratio and counts without any content", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    await db.insert(budgetLedger).values([
      {
        date: today,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        tokensIn: 1000,
        tokensCacheWrite: 200,
        tokensCacheRead: 700,
        tokensOut: 50,
        costUsd: "0.100000",
      },
      {
        date: today,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        tokensIn: 1000,
        tokensCacheWrite: 0,
        tokensCacheRead: 900,
        tokensOut: 50,
        costUsd: "0.050000",
      },
    ]);

    const response = await open.inject({ method: "GET", url: "/v1/stats" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      budget: { spentUsd: number; remainingUsd: number; degraded: boolean; callsToday: number };
      tokensToday: { cacheRead: number; cacheWrite: number };
      cacheHitRatio: number | null;
      counts: { memories: number; events: number };
    }>();

    expect(body.budget.spentUsd).toBeCloseTo(0.15, 6);
    expect(body.budget.remainingUsd).toBeCloseTo(0.35, 6);
    expect(body.budget.degraded).toBe(false);
    expect(body.budget.callsToday).toBe(2);
    expect(body.tokensToday.cacheRead).toBe(1600);
    expect(body.tokensToday.cacheWrite).toBe(200);
    // 1600 cached out of 2000 billed input: the §5.5 discipline is paying
    expect(body.cacheHitRatio).toBeCloseTo(0.8, 4);
    expect(body.counts.events).toBeGreaterThanOrEqual(0);

    // counts and money only: never a scrap of what was said
    expect(response.body).not.toMatch(/Test Persona|ciao|v1:/);
  });

  it("flags the degraded state once the budget is gone", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    await db.insert(budgetLedger).values({
      date: today,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "0.400000",
    });
    const body = (await open.inject({ method: "GET", url: "/v1/stats" })).json<{
      budget: { degraded: boolean; remainingUsd: number };
    }>();
    expect(body.budget.degraded).toBe(true);
    expect(body.budget.remainingUsd).toBe(0);
  });
});
