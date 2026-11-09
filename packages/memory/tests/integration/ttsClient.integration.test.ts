import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  PRIME_ACCOUNT_ID,
  PRIME_GOSINO_ID,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_TTS_MODEL, OpenRouterTtsClient } from "../../src/ttsClient.js";

// Real Postgres ledger + real OpenRouter voice (ADR-125: no stubs).

const API_KEY = process.env.OPENROUTER_API_KEY;
if (API_KEY === undefined || API_KEY === "") {
  throw new Error("OPENROUTER_API_KEY is required: these tests call the real provider (ADR-125)");
}
const TZ = "Europe/Rome";
const SPENDER = { accountId: PRIME_ACCOUNT_ID, gosinoId: PRIME_GOSINO_ID };
/** una voce ElevenLabs che OpenRouter accetta per nome (la stessa di Omega HQ) */
const VOICE = "george";

let pg: StartedPostgreSqlContainer;
let db: DbClient;

const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

function makeClient(dailyBudgetUsd = 0.5, model = DEFAULT_TTS_MODEL): OpenRouterTtsClient {
  return new OpenRouterTtsClient({ db, apiKey: API_KEY ?? "", dailyBudgetUsd, model, timezone: TZ });
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
});

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

afterEach(async () => {
  await db.delete(budgetLedger);
});

describe("the voice, through OpenRouter", () => {
  it("returns real mp3 audio and records its cost per character", async () => {
    const client = makeClient();
    const audio = await client.synth({ text: "Ciao, sono UGO.", mood: "gasato", voice: VOICE }, SPENDER);

    expect(audio).toBeDefined();
    // an MPEG stream starts with an ID3 tag or a frame sync
    const head = audio?.subarray(0, 3).toString("latin1");
    expect(head === "ID3" || (audio?.[0] === 0xff && ((audio[1] ?? 0) & 0xe0) === 0xe0)).toBe(true);

    const rows = await db.select().from(budgetLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
    expect(rows[0]?.model).toBe(DEFAULT_TTS_MODEL);
    expect(rows[0]?.date).toBe(today());
    // the tag is part of what OpenRouter bills: "[excited] Ciao, sono UGO."
    const charged = "[excited] Ciao, sono UGO.".length;
    expect(rows[0]?.tokensIn).toBe(charged);
    expect(Number(rows[0]?.costUsd)).toBeCloseTo(charged * (await client.usdPerChar()), 6);
  });

  it("reads the live per-character price from OpenRouter's catalogue", async () => {
    const price = await makeClient().usdPerChar();
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(0.001);
  });

  it("does not speak, and does not spend, once the house budget is gone", async () => {
    await db.insert(budgetLedger).values({
      ...SPENDER,
      date: today(),
      provider: "openrouter",
      model: DEFAULT_TTS_MODEL,
      tokensIn: 1,
      tokensOut: 0,
      costUsd: "0.600000",
    });
    const audio = await makeClient(0.5).synth({ text: "ciao", voice: VOICE }, SPENDER);
    expect(audio).toBeUndefined();
    expect(await db.select().from(budgetLedger)).toHaveLength(1);
  });

  it("degrades without a ledger row when the provider refuses", async () => {
    const audio = await makeClient(0.5, "ugo/this-voice-model-does-not-exist").synth(
      { text: "ciao", voice: VOICE },
      SPENDER,
    );
    expect(audio).toBeUndefined();
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });
});
