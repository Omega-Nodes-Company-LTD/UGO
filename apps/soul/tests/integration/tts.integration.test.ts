import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, runMigrations, traitSets, type DbClient } from "@ugo/db";
import { DEFAULT_TTS_MODEL, OpenRouterTtsClient } from "@ugo/memory";
import { openRouterKey, REFUSED_MODEL, startPostgres } from "@ugo/factories";
import { speakingVoice } from "@ugo/psyche";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { voiceOf } from "../../src/routes/tts.js";
import { RecognitionClient } from "../../src/services/recognitionClient.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { addGosino, createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * La voce (ADR-125, ADR-126). Le promesse che valgono un test: ogni frase
 * sintetizzata è una riga di budget_ledger (regola 3) col costo del listino
 * vivo; a salvadanaio vuoto NON si chiama il fornitore e si degrada con un
 * 204; il memo non ripaga le frasi di rito; la voce è quella del CORPO del
 * gosino. Il fornitore è OpenRouter VERO (niente stub): l'audio è un mp3 vero.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let house: TestHouse;
let token = "";

/** quante righe ha scritto il fornitore per questa casa: la prova che è stato chiamato */
const ledgerRows = async (): Promise<number> =>
  (await db.select().from(budgetLedger).where(eq(budgetLedger.accountId, house.id))).length;

/** un MPEG vero comincia con un tag ID3 o con un frame sync */
const isMp3 = (audio: Buffer): boolean =>
  audio.subarray(0, 3).toString("latin1") === "ID3" ||
  (audio[0] === 0xff && ((audio[1] ?? 0) & 0xe0) === 0xe0);

const ttsClient = (model = DEFAULT_TTS_MODEL): OpenRouterTtsClient =>
  new OpenRouterTtsClient({
    db,
    apiKey: openRouterKey(),
    dailyBudgetUsd: 0.5,
    model,
    timezone: "Europe/Rome",
  });

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  house = await createHouse(db, "casa-voce");
  token = (await issueToken(db, { accountId: house.id, role: "owner", label: "voce" })).token;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      tts: ttsClient(),
    },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await container.stop();
});

describe("POST /v1/tts", () => {
  it("sintetizza un mp3 vero, e la frase finisce nel ledger col suo costo", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Grunf! Che bella giornata.", mood: "gasato" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(isMp3(response.rawPayload)).toBe(true);

    const rows = await db
      .select({ provider: budgetLedger.provider, model: budgetLedger.model, cost: budgetLedger.costUsd })
      .from(budgetLedger)
      .where(eq(budgetLedger.accountId, house.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
    expect(rows[0]?.model).toBe(DEFAULT_TTS_MODEL);
    expect(Number(rows[0]?.cost)).toBeGreaterThan(0);
  });

  it("il memo: la stessa frase non si ripaga", async () => {
    const before = await ledgerRows();
    const again = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Grunf! Che bella giornata.", mood: "gasato" },
    });
    expect(again.statusCode).toBe(200);
    expect(await ledgerRows()).toBe(before);
  });

  it("a salvadanaio vuoto degrada con 204 SENZA chiamare il fornitore", async () => {
    await db.execute(
      sql`update accounts set daily_budget_usd = 0.000001 where id = ${house.id}`,
    );
    const before = await ledgerRows();
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "Questa frase non deve costare niente." },
    });
    expect(response.statusCode).toBe(204);
    expect(await ledgerRows()).toBe(before);
    await db.execute(sql`update accounts set daily_budget_usd = null where id = ${house.id}`);
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
 * ADR-126: la voce viene dal corpo. Due gosini della stessa casa, uno grosso e
 * uno minuto, parlano con voci diverse — e senza genoma si parla col corpo di
 * un UGO qualunque.
 */
describe("voiceOf — la voce del corpo", () => {
  it("due corpi diversi, due voci diverse; il più grosso parla più basso", async () => {
    const minuto = await addGosino(db, house, "Minuto");
    const grosso = await addGosino(db, house, "Grosso");
    await db.insert(traitSets).values([
      { accountId: house.id, gosinoId: minuto, version: 1, traits: { chonk: 0.05, snout: 0.1 } },
      { accountId: house.id, gosinoId: grosso, version: 1, traits: { chonk: 0.98, snout: 0.9 } },
    ]);
    const small = await voiceOf(db, minuto);
    const big = await voiceOf(db, grosso);
    expect(small).not.toBe(big);
    expect(small).toBe(speakingVoice({ chonk: 0.05, snout: 0.1 }).name);
    expect(big).toBe(speakingVoice({ chonk: 0.98, snout: 0.9 }).name);
  });

  it("legge l'ULTIMA versione del genoma", async () => {
    const cresciuto = await addGosino(db, house, "Cresciuto");
    await db.insert(traitSets).values([
      { accountId: house.id, gosinoId: cresciuto, version: 1, traits: { chonk: 0.05, snout: 0.1 } },
      { accountId: house.id, gosinoId: cresciuto, version: 2, traits: { chonk: 0.98, snout: 0.9 } },
    ]);
    expect(await voiceOf(db, cresciuto)).toBe(speakingVoice({ chonk: 0.98, snout: 0.9 }).name);
  });

  it("senza genoma è il corpo di un UGO qualunque", async () => {
    const senza = await addGosino(db, house, "Senza");
    expect(await voiceOf(db, senza)).toBe(speakingVoice({ chonk: 0.62, snout: 0.55 }).name);
  });
});

/**
 * La voce di casa (decisione 2026-08-16): Piper come gradino di mezzo.
 * Fornitore che rifiuta → la percezione sintetizza (WAV, zero ledger);
 * anche lei giù → 204 e voce di sistema. Il fornitore è OpenRouter VERO con
 * un modello che rifiuta; la percezione è ancora un server HTTP finto di un
 * ALTRO servizio (debito dichiarato in STATE: non è il fornitore di ADR-125).
 */
describe("POST /v1/tts — la catena con la voce di casa", () => {
  it("il fornitore rifiuta: la frase esce comunque, in WAV e gratis", async () => {
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
      logger: false,
      features: {
        chat: undefined as never,
        psyche: undefined as never,
        // il fornitore esiste ma rifiuta davvero: il gradino sotto deve reggere
        tts: ttsClient(REFUSED_MODEL),
        ttsLocal: (accountId: string) =>
          new RecognitionClient({
            baseUrl: `http://127.0.0.1:${String(address.port)}`,
            token: "interno-di-test",
            accountId,
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
      logger: false,
      features: {
        chat: undefined as never,
        psyche: undefined as never,
        ttsLocal: (accountId: string) =>
          new RecognitionClient({
            baseUrl: "http://127.0.0.1:1",
            token: "interno-di-test",
            accountId,
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
