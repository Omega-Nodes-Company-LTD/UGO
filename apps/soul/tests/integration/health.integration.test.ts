import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  /**
   * ADR-110: il nodo GPU è una seconda macchina, e `/health` deve saper dire
   * quale delle due è caduta. «Spenta» resta uno stato legittimo — con una
   * casa sola non c'è nessun nodo GPU, ed è il caso normale.
   */
  it("dice «off» per il nodo GPU quando non è configurato, senza degradare", async () => {
    const app = buildServer({
      db,
      mqtt: { url: mqttUrl },
      // ollama di casa raggiungibile non lo è mai in questo test: si guarda
      // solo la riga del nodo GPU, che è quella che questa prova aggiunge
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const body = (await app.inject({ method: "GET", url: "/health" })).json<{
        checks: Record<string, string>;
      }>();
      expect(body.checks.ollamaGpu).toBe("off");
    } finally {
      await app.close();
    }
  });

  it("e «error» quando c'è ma non risponde: due macchine, due righe", async () => {
    const app = buildServer({
      db,
      mqtt: { url: mqttUrl },
      ollamaUrl: `http://${UNREACHABLE}`,
      ollamaGpuUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      const body = response.json<{ status: string; checks: Record<string, string> }>();
      expect(body.checks.ollamaGpu).toBe("error");
      // un nodo GPU giù è una degradazione, non un servizio morto: senza di
      // lui il vision e il testo locale tornano a girare come prima
      expect(body.status).toBe("degraded");
      expect(response.statusCode).toBe(200);
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

// ADR-018 Tempo 1: soul serves the built face so phone and API share one
// origin — one certificate, a secure context, and a same-origin `wss://`.
describe("the face bundle served by soul", () => {
  let faceRoot: string;

  beforeAll(async () => {
    faceRoot = await mkdtemp(join(tmpdir(), "ugo-face-"));
    await writeFile(join(faceRoot, "index.html"), "<!doctype html><title>UGO</title>", "utf8");
    await writeFile(join(faceRoot, "manifest.webmanifest"), '{"name":"UGO"}', "utf8");
  });

  afterAll(async () => {
    await rm(faceRoot, { recursive: true, force: true });
  });

  it("answers / with the bundle and still routes the API", async () => {
    const app = buildServer({
      db,
      faceRoot,
      mqtt: { url: mqttUrl },
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      await app.ready();
      const page = await app.inject({ method: "GET", url: "/" });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("UGO");

      const manifest = await app.inject({ method: "GET", url: "/manifest.webmanifest" });
      expect(manifest.statusCode).toBe(200);

      // the static root must never shadow an API route
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json<{ status: string }>().status).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it("starts anyway when no bundle was built into the image", async () => {
    const app = buildServer({
      db,
      faceRoot: join(faceRoot, "nowhere"),
      mqtt: { url: mqttUrl },
      ollamaUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      await app.ready();
      expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

/**
 * ADR-101: la percezione dentro `/health`.
 *
 * Da lei dipendono volto e voce, e il controllo non la guardava: un container
 * di percezione morto era un riconoscimento che smetteva di funzionare senza
 * che niente diventasse rosso. «Assente» resta diverso da «rotto» — una casa
 * senza riconoscimento è una scelta, non un guasto.
 */
describe("GET /health e la percezione (ADR-101)", () => {
  it("non configurata è «off», e non degrada niente", async () => {
    const app = buildServer({ db, mqtt: { url: mqttUrl }, ollamaUrl: `http://${UNREACHABLE}`, logger: false });
    try {
      const body = (await app.inject({ method: "GET", url: "/health" })).json<{
        checks: Record<string, string>;
      }>();
      expect(body.checks.perception).toBe("off");
    } finally {
      await app.close();
    }
  });

  it("configurata e irraggiungibile è «error», e il servizio si dichiara degradato", async () => {
    const app = buildServer({
      db,
      mqtt: { url: mqttUrl },
      ollamaUrl: `http://${UNREACHABLE}`,
      perceptionUrl: `http://${UNREACHABLE}`,
      logger: false,
    });
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      const body = response.json<{ status: string; checks: Record<string, string> }>();
      expect(body.checks.perception).toBe("error");
      expect(body.status).toBe("degraded");
      // degradato, non «unavailable»: senza volto UGO parla ancora
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
