import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";

// Zero-Mock: real Postgres (Testcontainers) and a real ephemeral Mosquitto
// broker. Degradation paths are exercised by pointing checks at addresses
// where nothing listens — a real network failure, not a stub.

const UNREACHABLE = "127.0.0.1:1"; // port 1: nothing listens there

const MOSQUITTO_ANON_CONF = `listener 1883
allow_anonymous true
`;

let pgContainer: StartedPostgreSqlContainer;
let mqttContainer: StartedTestContainer;
let db: DbClient;
let mqttUrl: string;

beforeAll(async () => {
  [pgContainer, mqttContainer] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    new GenericContainer("eclipse-mosquitto:2")
      .withCopyContentToContainer([
        { content: MOSQUITTO_ANON_CONF, target: "/mosquitto/config/mosquitto.conf" },
      ])
      .withExposedPorts(1883)
      .start(),
  ]);
  await runMigrations(pgContainer.getConnectionUri());
  db = createDbClient(pgContainer.getConnectionUri());
  mqttUrl = `mqtt://${mqttContainer.getHost()}:${String(mqttContainer.getMappedPort(1883))}`;
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pgContainer.stop(), mqttContainer.stop()]);
});

describe("GET /health", () => {
  it("reports ok for db and mqtt when both are reachable", async () => {
    const app = buildServer({
      db,
      mqtt: { url: mqttUrl },
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        status: string;
        checks: Record<string, string>;
      }>();
      expect(body.checks.db).toBe("ok");
      expect(body.checks.mqtt).toBe("ok");
      expect(body.checks.ollama).toBe("error");
      expect(body.status).toBe("degraded");
    } finally {
      await app.close();
    }
  });

  it("degrades without failing when mqtt and ollama are down", async () => {
    const app = buildServer({
      db,
      mqtt: { url: `mqtt://${UNREACHABLE}` },
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string; checks: Record<string, string> }>();
      expect(body.status).toBe("degraded");
      expect(body.checks.db).toBe("ok");
      expect(body.checks.mqtt).toBe("error");
      expect(body.checks.ollama).toBe("error");
    } finally {
      await app.close();
    }
  });

  it("returns 503 when the database is unreachable (db is vital)", async () => {
    const deadDb = createDbClient(`postgres://ugo:wrong@${UNREACHABLE}/ugo`);
    const app = buildServer({
      db: deadDb,
      mqtt: { url: mqttUrl },
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(503);
      const body = response.json<{ status: string; checks: Record<string, string> }>();
      expect(body.status).toBe("unavailable");
      expect(body.checks.db).toBe("error");
    } finally {
      await app.close();
      await deadDb.$client.end();
    }
  });

  it("never leaks connection details in the response", async () => {
    const app = buildServer({
      db,
      mqtt: { url: mqttUrl, username: "soul", password: "supersecretpassword" },
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.body).not.toContain("supersecretpassword");
      expect(response.body).not.toContain(mqttUrl);
    } finally {
      await app.close();
    }
  });
});
