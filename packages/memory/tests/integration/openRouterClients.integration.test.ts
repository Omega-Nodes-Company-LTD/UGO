import { execFileSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  PRIME_ACCOUNT_ID,
  PRIME_GOSINO_ID,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { openRouterKey, REFUSED_MODEL } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CHAT_MODEL } from "../../src/chatRequest.js";
import { LlmClient } from "../../src/llmClient.js";
import { DEFAULT_STT_MODEL, OpenRouterSttClient } from "../../src/openRouterStt.js";
import { OpenRouterTextClient } from "../../src/openRouterText.js";
import { OpenRouterVisionClient } from "../../src/openRouterVision.js";
import { OpenRouterTtsClient } from "../../src/ttsClient.js";
import { DEFAULT_VISION_MODEL } from "../../src/visionRequest.js";

/**
 * ADR-131: quello che faceva Ollama — il testo breve, gli occhi, la dettatura
 * — ora passa da OpenRouter. Tutto vero (ADR-125): Postgres col registro e il
 * fornitore vero. Gli input sintetici li produce ffmpeg vero (un'immagine) e
 * la voce vera di OpenRouter (l'audio da trascrivere): niente file finti.
 */

const TZ = "Europe/Rome";

let pg: StartedPostgreSqlContainer;
let db: DbClient;

const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

function llm(model: string, dailyBudgetUsd = 0.5): LlmClient {
  return new LlmClient({ db, apiKey: openRouterKey(), model, dailyBudgetUsd, timezone: TZ });
}

async function rowsFor(model: string): Promise<(typeof budgetLedger.$inferSelect)[]> {
  return db.select().from(budgetLedger).where(eq(budgetLedger.model, model));
}

/** Svuota il salvadanaio di oggi con una riga vera sul registro. */
async function spendEverything(): Promise<void> {
  await db.insert(budgetLedger).values({
    accountId: PRIME_ACCOUNT_ID,
    gosinoId: PRIME_GOSINO_ID,
    date: today(),
    provider: "openrouter",
    model: "seed/spent",
    tokensIn: 1,
    tokensOut: 1,
    costUsd: "10.000000",
  });
}

/** ffmpeg vero su un input sintetico: un quadrato rosso su fondo bianco, in JPEG. */
function redSquareJpeg(): string {
  const jpeg = execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=128x128,drawbox=x=32:y=32:w=64:h=64:color=red:t=fill",
    "-frames:v",
    "1",
    "-f",
    "mjpeg",
    "pipe:1",
  ]);
  return jpeg.toString("base64");
}

/** mp3 → PCM int16 LE mono 16 kHz: esattamente quello che manda il muso. */
function mp3ToPcm16(mp3: Buffer): string {
  const pcm = execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
    { input: mp3 },
  );
  return pcm.toString("base64");
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

describe("il modello di casa, su OpenRouter (OpenRouterTextClient)", () => {
  it("risponde con una frase e la segna sul registro col modello di chat", async () => {
    const text = new OpenRouterTextClient(llm(DEFAULT_CHAT_MODEL));
    expect(await text.available()).toBe(true);
    const said = await text.generate("Rispondi con una sola parola: di che colore è il cielo sereno?", 20, {
      temperature: 0,
    });
    expect(said).toBeDefined();
    expect(said?.toLowerCase()).toMatch(/azzurr|blu|celest/);
    const rows = await rowsFor(DEFAULT_CHAT_MODEL);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.costUsd)).toBeGreaterThan(0);
  });

  it("a salvadanaio vuoto torna undefined, senza chiamare il fornitore", async () => {
    await spendEverything();
    const text = new OpenRouterTextClient(llm(DEFAULT_CHAT_MODEL));
    expect(await text.generate("ciao", 10)).toBeUndefined();
    expect(await rowsFor(DEFAULT_CHAT_MODEL)).toHaveLength(0);
  });

  it("un rifiuto del fornitore è undefined, mai un'eccezione, e nessuna riga", async () => {
    const warned: Record<string, unknown>[] = [];
    const text = new OpenRouterTextClient(llm(REFUSED_MODEL), {
      warn: (data) => warned.push(data),
    });
    expect(await text.generate("ciao", 10)).toBeUndefined();
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
    expect(warned).toHaveLength(1);
  });
});

describe("gli occhi, su OpenRouter (OpenRouterVisionClient)", () => {
  it("descrive un'immagine vera e la paga dal registro, col modello vision", async () => {
    const eyes = new OpenRouterVisionClient(llm(DEFAULT_VISION_MODEL), DEFAULT_VISION_MODEL);
    const seen = await eyes.describe(redSquareJpeg());
    expect(seen).toBeDefined();
    expect(seen?.toLowerCase()).toMatch(/ross|red|quadrat|square/);
    const rows = await rowsFor(DEFAULT_VISION_MODEL);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
  });

  it("a salvadanaio vuoto non guarda: undefined e nessuna chiamata", async () => {
    await spendEverything();
    const eyes = new OpenRouterVisionClient(llm(DEFAULT_VISION_MODEL), DEFAULT_VISION_MODEL);
    expect(await eyes.describe(redSquareJpeg())).toBeUndefined();
    expect(await rowsFor(DEFAULT_VISION_MODEL)).toHaveLength(0);
  });
});

describe("la dettatura, su OpenRouter (OpenRouterSttClient)", () => {
  it("trascrive una voce vera in italiano e segna la spesa", async () => {
    const voice = new OpenRouterTtsClient({ db, apiKey: openRouterKey(), dailyBudgetUsd: 0.5, timezone: TZ });
    const mp3 = await voice.synth(
      { text: "Buongiorno, oggi piove a Parma.", voice: "george" },
      { accountId: PRIME_ACCOUNT_ID, gosinoId: PRIME_GOSINO_ID },
    );
    expect(mp3, "la voce di prova non è arrivata").toBeDefined();

    const ears = new OpenRouterSttClient({ db, apiKey: openRouterKey(), timezone: TZ });
    const heard = await ears.transcribe(mp3ToPcm16(mp3 ?? Buffer.alloc(0)));
    expect(heard.kind).toBe("text");
    if (heard.kind !== "text") return;
    expect(heard.text.toLowerCase()).toMatch(/parma/);
    const rows = await rowsFor(DEFAULT_STT_MODEL);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("openrouter");
  });

  it("un modello rifiutato è «unusable» (4xx = il clip), non «down», e non costa", async () => {
    const ears = new OpenRouterSttClient({ db, apiKey: openRouterKey(), model: REFUSED_MODEL });
    const silence = Buffer.alloc(16_000 * 2).toString("base64");
    expect(await ears.transcribe(silence)).toEqual({ kind: "unusable" });
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });
});
