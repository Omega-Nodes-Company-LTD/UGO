import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import type { SttOutcome } from "../../src/routes/stt.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * Il ponte della dettatura locale (gruppo 13). Whisper vero sta nel servizio
 * di percezione e si prova col deploy; qui si prova il PONTE: 501 quando la
 * dettatura non è configurata (il muso resta sul browser), 503 quando whisper
 * è giù (il muso decide lui), il testo quando c'è, e il tetto sull'audio.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let muteApp: FastifyInstance;
let house: TestHouse;
let token = "";
let answer: SttOutcome = { kind: "text", text: "ciao ugo come stai" };
const heard: string[] = [];

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  house = await createHouse(db, "casa-dettatura");
  token = (await issueToken(db, { accountId: house.id, role: "owner", label: "stt" })).token;

  const base = {
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false as const,
  };
  app = buildServer({
    ...base,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      stt: (accountId: string) => ({
        transcribe: (audio: string) => {
          heard.push(`${accountId.slice(0, 8)}:${String(audio.length)}`);
          return Promise.resolve(answer);
        },
      }),
    },
  });
  muteApp = buildServer({
    ...base,
    features: { chat: undefined as never, psyche: undefined as never },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await muteApp.close();
  await db.$client.end();
  await container.stop();
});

const AUDIO = Buffer.from("finto-pcm-di-un-enunciato").toString("base64");

describe("POST /v1/stt", () => {
  it("trascrive per la casa giusta, e il testo torna al muso", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: { authorization: `Bearer ${token}` },
      payload: { audio: AUDIO },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ text: "ciao ugo come stai" });
    expect(heard.at(-1)).toBe(`${house.id.slice(0, 8)}:${String(AUDIO.length)}`);
  });

  it("whisper giù = 503: esiste ma non risponde, che non è un 501", async () => {
    answer = { kind: "down" };
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: { authorization: `Bearer ${token}` },
      payload: { audio: AUDIO },
    });
    expect(response.statusCode).toBe(503);
    answer = { kind: "text", text: "ciao ugo come stai" };
  });

  /**
   * Il difetto costato la dettatura locale a un'installazione intera.
   *
   * Percezione risponde 422 «troppo corto» a un clip sotto gli 0,8 s — cioè a
   * un «sì» — e soul lo traduceva in 503 «servizio giù». Tre monosillabi di
   * fila e il muso dichiarava whisper morto, tornava al riconoscitore del
   * browser (quindi la voce ricominciava a uscire di casa) e se lo ricordava
   * fra le ricariche. I due «no» non sono lo stesso no.
   */
  it("un clip che non si trascrive è 422, non 503: si perde il clip, non la strada", async () => {
    answer = { kind: "unusable" };
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: { authorization: `Bearer ${token}` },
      payload: { audio: AUDIO },
    });
    expect(response.statusCode).toBe(422);
    answer = { kind: "text", text: "ciao ugo come stai" };
  });

  it("senza dettatura configurata risponde 501: il muso resta sul browser", async () => {
    const response = await muteApp.inject({
      method: "POST",
      url: "/v1/stt",
      headers: { authorization: `Bearer ${token}` },
      payload: { audio: AUDIO },
    });
    expect(response.statusCode).toBe(501);
  });

  it("il tetto sull'audio: un nastro non è un enunciato", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: { authorization: `Bearer ${token}` },
      payload: { audio: "a".repeat(520_001) },
    });
    expect(response.statusCode).toBe(400);
  });
});
