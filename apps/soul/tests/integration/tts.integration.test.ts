import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { OpenAiTtsClient } from "@ugo/memory";
import { startPostgres } from "@ugo/factories";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { instructionsFor } from "../../src/routes/tts.js";
import { RecognitionClient } from "../../src/services/recognitionClient.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * La voce interim (gruppo 13). Le promesse che valgono un test: ogni frase
 * sintetizzata è una riga di budget_ledger (regola 3); a salvadanaio vuoto
 * NON si chiama il fornitore e si degrada con un 204; il memo non ripaga le
 * frasi di rito; e l'umore entra nelle istruzioni. Il fornitore è uno stub
 * HTTP vero, come per il provider LLM.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let house: TestHouse;
let stub: Server;
let stubUrl = "";
let token = "";
const asked: { input: string; instructions: string }[] = [];

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  house = await createHouse(db, "casa-voce-interim");
  token = (await issueToken(db, { householdId: house.id, role: "owner", label: "voce" })).token;

  stub = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      asked.push(JSON.parse(body) as { input: string; instructions: string });
      response.writeHead(200, { "content-type": "audio/mpeg" });
      response.end(Buffer.from("finto-mp3-di-un-grugnito"));
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const address = stub.address();
  if (address === null || typeof address === "string") throw new Error("no stub address");
  stubUrl = `http://127.0.0.1:${String(address.port)}`;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      tts: new OpenAiTtsClient({
        db,
        apiKey: "test-key",
        dailyBudgetUsd: 0.5,
        baseUrl: stubUrl,
        timezone: "Europe/Rome",
      }),
    },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => stub.close(() => { resolve(); }));
  await db.$client.end();
  await container.stop();
});

describe("POST /v1/tts", () => {
  it("sintetizza, l'umore colora le istruzioni, e la frase finisce nel ledger", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Grunf! Che bella giornata.", mood: "allegro e fiero" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(asked.at(-1)?.input).toBe("Grunf! Che bella giornata.");
    expect(asked.at(-1)?.instructions).toContain("allegro e fiero");
    expect(instructionsFor(undefined)).not.toContain("umore");

    const rows = await db
      .select({ provider: budgetLedger.provider, cost: budgetLedger.costUsd })
      .from(budgetLedger)
      .where(eq(budgetLedger.householdId, house.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openai");
    expect(Number(rows[0]?.cost)).toBeGreaterThan(0);
  });

  it("il memo: la stessa frase non si ripaga", async () => {
    const before = asked.length;
    const again = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Grunf! Che bella giornata.", mood: "allegro e fiero" },
    });
    expect(again.statusCode).toBe(200);
    expect(asked.length).toBe(before);
  });

  it("a salvadanaio vuoto degrada con 204 SENZA chiamare il fornitore", async () => {
    await db.execute(
      sql`update households set daily_budget_usd = 0.000001 where id = ${house.id}`,
    );
    const before = asked.length;
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Questa frase non deve costare niente." },
    });
    expect(response.statusCode).toBe(204);
    expect(asked.length).toBe(before);
    await db.execute(sql`update households set daily_budget_usd = null where id = ${house.id}`);
  });

  it("il tetto sui caratteri: oltre 300 è un 400, non una fattura", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "a".repeat(301) },
    });
    expect(response.statusCode).toBe(400);
  });
});

/**
 * La voce di casa (decisione 2026-08-16): Piper come gradino di mezzo.
 * Fornitore giù o assente → la percezione sintetizza (WAV, zero ledger);
 * anche lei giù → 204 e voce di sistema. Percezione = stub HTTP vero,
 * client reale.
 */
describe("POST /v1/tts — la catena con la voce di casa", () => {
  it("fornitore irraggiungibile: la frase esce comunque, in WAV e gratis", async () => {
    const said: string[] = [];
    const percezione = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        said.push((JSON.parse(body) as { text: string }).text);
        response.writeHead(200, { "content-type": "audio/wav" });
        response.end(Buffer.from("RIFF-finto-wav-di-un-grugnito"));
      });
    });
    await new Promise<void>((resolve) => percezione.listen(0, "127.0.0.1", resolve));
    const address = percezione.address();
    if (address === null || typeof address === "string") throw new Error("no stub address");

    const chained = buildServer({
      db,
      mqtt: { url: "mqtt://127.0.0.1:1" },
      ollamaUrl: "http://127.0.0.1:1",
      logger: false,
      features: {
        chat: undefined as never,
        psyche: undefined as never,
        // il fornitore esiste ma non risponde: il gradino sotto deve reggere
        tts: new OpenAiTtsClient({
          db,
          apiKey: "test-key",
          dailyBudgetUsd: 0.5,
          baseUrl: "http://127.0.0.1:1",
          timezone: "Europe/Rome",
        }),
        ttsLocal: (householdId: string) =>
          new RecognitionClient({
            baseUrl: `http://127.0.0.1:${String(address.port)}`,
            token: "interno-di-test",
            householdId,
          }),
      },
    });
    const response = await chained.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Grunf! La voce di casa regge.", mood: "quieto" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/wav");
    expect(response.rawPayload.toString()).toContain("RIFF");
    expect(said).toEqual(["Grunf! La voce di casa regge."]);
    await chained.close();
    await new Promise<void>((resolve) => percezione.close(() => { resolve(); }));
  });

  it("anche la percezione giù: 204, e il muso si arrangia con la voce di sistema", async () => {
    const deaf = buildServer({
      db,
      mqtt: { url: "mqtt://127.0.0.1:1" },
      ollamaUrl: "http://127.0.0.1:1",
      logger: false,
      features: {
        chat: undefined as never,
        psyche: undefined as never,
        ttsLocal: (householdId: string) =>
          new RecognitionClient({
            baseUrl: "http://127.0.0.1:1",
            token: "interno-di-test",
            householdId,
          }),
      },
    });
    const response = await deaf.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Nessuno mi sente." },
    });
    expect(response.statusCode).toBe(204);
    await deaf.close();
  });
});
