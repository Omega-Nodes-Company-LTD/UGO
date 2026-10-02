import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { BAD_KEY, STUB_MP3, startLlmStub, startPostgres, type LlmStub } from "@ugo/factories";
import { ModelCatalog, pcm16ToWav } from "@ugo/memory";
import { generateDataKey } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { instructionsFor } from "../../src/routes/tts.js";
import { buildServer } from "../../src/server.js";
import { AiResolver } from "../../src/services/ai/resolver.js";
import { hear, speak } from "../../src/services/ai/voice.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-123: la voce e le orecchie della casa, dal pannello al muso.
 *
 * Il giro è quello vero: il titolare salva una chiave e sceglie un modello
 * da `/v1/ai/*`, il muso chiede `/v1/tts` e `/v1/stt`, soul risolve il ruolo
 * della casa e passa dal cancello. Il provider è lo stub di rete; il ledger è
 * Postgres. Le promesse di prima restano tutte: il memo non ripaga, il tetto
 * dei caratteri e dell'audio, 204/501 = il muso usa il browser, 422 ≠ 503.
 */

const MASTER = generateDataKey();
let container: StartedPostgreSqlContainer;
let db: DbClient;
let stub: LlmStub;
let app: FastifyInstance;
let ai: AiResolver;
let house: TestHouse;
let mute: TestHouse;
let token = "";
let muteToken = "";

/** un secondo di «parlato» PCM16 a 16 kHz, come lo manda il muso */
const SECOND = Buffer.alloc(32_000, 3).toString("base64");

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  stub = await startLlmStub();
  house = await createHouse(db, "casa-voce", { masterKey: MASTER });
  mute = await createHouse(db, "casa-muta", { masterKey: MASTER });
  token = (await issueToken(db, { accountId: house.id, role: "owner", label: "voce" })).token;
  muteToken = (await issueToken(db, { accountId: mute.id, role: "owner", label: "muta" })).token;

  const baseUrls = {
    openai: stub.baseUrl,
    elevenlabs: stub.baseUrl,
    openrouter: stub.baseUrl,
    anthropic: stub.baseUrl,
  };
  ai = new AiResolver({
    db,
    dbFor: () => db,
    masterKey: MASTER,
    dailyBudgetUsd: 0.5,
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
      resolver: ai,
      catalog: new ModelCatalog({ openRouterBaseUrl: stub.baseUrl, anthropicBaseUrl: stub.baseUrl }),
      platform: {},
      baseUrls,
      dailyBudgetUsd: 0.5,
    },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "chiuso",
      tts: (who, text, instructions) => speak(ai, who, text, instructions),
      stt: (who, audio) => hear(ai, who, audio),
    },
  });

  const as = { authorization: `Bearer ${token}` };
  for (const provider of ["openai", "elevenlabs"]) {
    const saved = await app.inject({
      method: "PUT",
      url: `/v1/ai/chiavi/${provider}`,
      headers: as,
      payload: { secret: `chiave-${provider}-1234` },
    });
    expect(saved.statusCode).toBe(200);
  }
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await container.stop();
  await stub.close();
});

const as = (t: string) => ({ authorization: `Bearer ${t}` });

describe("scegliere la voce", () => {
  it("rifiuta una voce che il provider non ha", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/tts",
      headers: as(token),
      payload: { provider: "elevenlabs", model: "eleven_flash_v2_5", voice: "inventata" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("elenca le voci dell'account ElevenLabs con la chiave della casa", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/ai/voci?provider=elevenlabs", headers: as(token) });
    expect(res.json()).toEqual({ voci: [{ id: "voce-rachele", label: "Rachele" }] });
  });

  it("elenca solo i modelli OpenRouter che parlano, per la voce", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/ai/modelli?provider=openrouter&ruolo=tts",
      headers: as(token),
    });
    expect(res.json<{ modelli: { id: string }[] }>().modelli.map((m) => m.id)).toEqual([
      "openai/gpt-4o-audio-preview",
    ]);
  });
});

describe("POST /v1/tts", () => {
  it("con la voce scelta: l'umore colora il tono, la frase finisce nel ledger", async () => {
    const chosen = await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/tts",
      headers: as(token),
      payload: { provider: "openai", model: "gpt-4o-mini-tts", voice: "coral" },
    });
    expect(chosen.statusCode).toBe(204);
    stub.reset();
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: as(token),
      payload: { text: "Grunf! Che bella giornata.", mood: "allegro e fiero" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(response.rawPayload.equals(STUB_MP3)).toBe(true);
    const asked = stub.completions[0]?.body as unknown as { input: string; instructions: string; voice: string };
    expect(asked).toMatchObject({ input: "Grunf! Che bella giornata.", voice: "coral" });
    expect(asked.instructions).toContain("allegro e fiero");
    expect(instructionsFor(undefined)).not.toContain("umore");
    expect(stub.completions[0]?.headers.authorization).toBe("Bearer chiave-openai-1234");
    const rows = await db.select().from(budgetLedger).where(eq(budgetLedger.accountId, house.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openai");
  });

  it("il memo: la stessa frase non si ripaga", async () => {
    stub.reset();
    const again = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: as(token),
      payload: { text: "Grunf! Che bella giornata.", mood: "allegro e fiero" },
    });
    expect(again.statusCode).toBe(200);
    expect(stub.completions).toHaveLength(0);
  });

  it("ElevenLabs con la voce del suo account", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/tts",
      headers: as(token),
      payload: { provider: "elevenlabs", model: "eleven_flash_v2_5", voice: "voce-rachele" },
    });
    stub.reset();
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: as(token),
      payload: { text: "Una frase nuova." },
    });
    expect(response.statusCode).toBe(200);
    expect(stub.completions[0]?.path).toBe("/v1/text-to-speech/voce-rachele");
  });

  it("una casa senza voce scelta: 204, e il muso usa la sua", async () => {
    stub.reset();
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: as(muteToken),
      payload: { text: "Ci sei?" },
    });
    expect(response.statusCode).toBe(204);
    expect(stub.completions).toHaveLength(0);
  });

  it("a salvadanaio vuoto degrada con 204 SENZA chiamare il fornitore", async () => {
    await db.execute(sql`update accounts set daily_budget_usd = 0.000001 where id = ${house.id}`);
    stub.reset();
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: as(token),
      payload: { text: "Questa non la pago." },
    });
    expect(response.statusCode).toBe(204);
    expect(stub.completions).toHaveLength(0);
    await db.execute(sql`update accounts set daily_budget_usd = null where id = ${house.id}`);
  });

  it("il tetto sui caratteri: oltre 300 è un 400, non una fattura", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: as(token),
      payload: { text: "a".repeat(301) },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("POST /v1/stt", () => {
  it("senza orecchie scelte risponde 501: il muso resta sul browser", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: as(muteToken),
      payload: { audio: SECOND },
    });
    expect(response.statusCode).toBe(501);
  });

  it("trascrive con le orecchie della casa, e l'audio non resta da nessuna parte", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/ai/scelte/stt",
      headers: as(token),
      payload: { provider: "openai", model: "gpt-4o-mini-transcribe" },
    });
    stub.reset();
    stub.nextResponse = { text: "ciao ugo come stai" };
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: as(token),
      payload: { audio: SECOND },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ text: "ciao ugo come stai" });
    // il PCM del muso è arrivato al provider come WAV
    expect(stub.raw[0]).toContain("RIFF");
    expect(pcm16ToWav(Buffer.alloc(0)).length).toBe(44);
  });

  it("un clip troppo corto è 422, non 503: si perde il clip, non la strada", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: as(token),
      payload: { audio: Buffer.alloc(3200).toString("base64") },
    });
    expect(response.statusCode).toBe(422);
  });

  it("una chiave rifiutata è 503 — esiste ma non risponde — e si segna", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/ai/chiavi/openai",
      headers: as(token),
      payload: { secret: "chiave-che-scadrà-0000" },
    });
    // la chiave viene rifiutata dopo essere stata salvata: si simula col BAD_KEY
    const { encryptText } = await import("@ugo/shared");
    await db.execute(
      sql`update provider_credentials set secret_enc = ${encryptText(BAD_KEY, house.dataKey)}
          where account_id = ${house.id} and provider = 'openai'`,
    );
    ai.invalidate(house.id);
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: as(token),
      payload: { audio: SECOND },
    });
    expect(response.statusCode).toBe(503);
  });

  it("il tetto sull'audio: un nastro non è un enunciato", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/stt",
      headers: as(token),
      payload: { audio: "a".repeat(520_001) },
    });
    expect(response.statusCode).toBe(400);
  });
});
