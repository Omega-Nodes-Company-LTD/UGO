import {
  budgetLedger,
  createDbClient,
  creditLedger,
  PRIME_ACCOUNT_ID,
  PRIME_GOSINO_ID,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import {
  BAD_KEY,
  STUB_MP3,
  startLlmStub,
  startPostgres,
  type LlmStub,
  type PostgresHandle,
} from "@ugo/factories";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ElevenLabsSpeech, ElevenLabsTranscribe } from "../../src/voice/elevenlabs.js";
import { gatedSpeech, gatedTranscript, type VoiceGateOptions } from "../../src/voice/gate.js";
import { OpenAiSpeech, OpenAiTranscribe } from "../../src/voice/openai.js";
import { OpenRouterSpeech, OpenRouterTranscribe } from "../../src/voice/openrouter.js";
import { voicesFor } from "../../src/voice/catalog.js";
import { pcm16ToWav } from "../../src/voice/wav.js";

/**
 * ADR-123: la voce passa dallo stesso cancello del testo. Postgres vero e
 * stub di rete vero: l'audio fa il giro HTTP, la riga di ledger si rilegge.
 */

let pg: PostgresHandle;
let db: DbClient;
let stub: LlmStub;

beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  stub = await startLlmStub();
});

afterAll(async () => {
  await db.$client.end();
  await pg.container.stop();
  await stub.close();
});

afterEach(async () => {
  await db.delete(creditLedger);
  await db.delete(budgetLedger);
  stub.reset();
});

const gate = (extra: Partial<VoiceGateOptions> = {}): VoiceGateOptions => ({
  db,
  accountId: PRIME_ACCOUNT_ID,
  gosinoId: PRIME_GOSINO_ID,
  timezone: "Europe/Rome",
  dailyBudgetUsd: 5,
  keySource: "byok",
  ...extra,
});

/** un secondo di «parlato» a 16 kHz: abbastanza da essere un enunciato */
const SECOND = pcm16ToWav(Buffer.alloc(32_000, 3));

describe("la sintesi", () => {
  it("OpenAI: l'audio torna, il tono viaggia, la riga è a listino", async () => {
    const speech = await gatedSpeech(
      gate(),
      new OpenAiSpeech({ apiKey: "k", model: "gpt-4o-mini-tts", baseUrl: stub.baseUrl }),
      "Ciao, sono UGO.",
      { voice: "coral", instructions: "allegro" },
    );
    expect(speech?.audio.equals(STUB_MP3)).toBe(true);
    expect(stub.completions[0]?.body).toMatchObject({ voice: "coral", instructions: "allegro" });
    const [row] = await db.select().from(budgetLedger);
    expect(row).toMatchObject({ provider: "openai", costSource: "list", tokensIn: 15 });
  });

  it("ElevenLabs: la voce scelta sta nell'indirizzo, la chiave nell'header", async () => {
    await gatedSpeech(
      gate(),
      new ElevenLabsSpeech({ apiKey: "eleven-k", model: "eleven_flash_v2_5", baseUrl: stub.baseUrl }),
      "Grunf.",
      { voice: "voce-rachele" },
    );
    expect(stub.completions[0]?.path).toBe("/v1/text-to-speech/voce-rachele");
    expect(stub.completions[0]?.headers["xi-api-key"]).toBe("eleven-k");
  });

  it("OpenRouter: i pezzi del flusso diventano un wav, e il conto è suo", async () => {
    stub.nextResponse = { cost: 0.0007 };
    const speech = await gatedSpeech(
      gate(),
      new OpenRouterSpeech({ apiKey: "k", model: "openai/gpt-4o-audio-preview", baseUrl: stub.baseUrl }),
      "Buongiorno.",
      { voice: "alloy" },
    );
    expect(speech?.mime).toBe("audio/wav");
    expect(speech?.audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(speech?.audio.length).toBe(44 + 9600);
    const [row] = await db.select().from(budgetLedger);
    expect(row).toMatchObject({ provider: "openrouter", costSource: "provider" });
    expect(Number(row?.costUsd)).toBeCloseTo(0.0007, 6);
  });

  it("una chiave rifiutata non è un'eccezione: il muso userà la sua voce", async () => {
    let told = false;
    const speech = await gatedSpeech(
      gate({ onAuthFailure: () => (told = true) }),
      new OpenAiSpeech({ apiKey: BAD_KEY, model: "tts-1", baseUrl: stub.baseUrl }),
      "Ciao.",
      { voice: "alloy" },
    );
    expect(speech).toBeUndefined();
    expect(told).toBe(true);
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("con le chiavi UGO scala il credito", async () => {
    await db.insert(creditLedger).values({ accountId: PRIME_ACCOUNT_ID, kind: "topup", amountMicros: 1_000_000 });
    const debited: string[] = [];
    let debitedDone: () => void = () => undefined;
    const told = new Promise<void>((resolve) => {
      debitedDone = resolve;
    });
    await gatedSpeech(
      gate({
        keySource: "ugo",
        credit: { markup: 1.3, usdToEur: 0.92 },
        // ADR-130 §5: dopo l'addebito, fuori dalla coda — è qui che parte la ricarica
        onCreditDebited: (accountId) => {
          debited.push(accountId);
          debitedDone();
        },
      }),
      new OpenAiSpeech({ apiKey: "k", model: "tts-1", baseUrl: stub.baseUrl }),
      "Una frase di prova.",
      { voice: "alloy" },
    );
    const usage = (await db.select().from(creditLedger)).filter((r) => r.kind === "usage");
    expect(usage).toHaveLength(1);
    await told;
    expect(debited).toEqual([PRIME_ACCOUNT_ID]);
  });
});

describe("l'ascolto", () => {
  it("OpenAI: il wav va come file, in italiano, e torna il testo", async () => {
    stub.nextResponse = { text: "accendi la luce" };
    const heard = await gatedTranscript(
      gate(),
      new OpenAiTranscribe({ apiKey: "k", model: "gpt-4o-mini-transcribe", baseUrl: stub.baseUrl }),
      SECOND,
    );
    expect(heard).toEqual({ kind: "text", text: "accendi la luce" });
    expect(stub.raw[0]).toContain("RIFF");
    expect(stub.raw[0]).toContain("gpt-4o-mini-transcribe");
    const [row] = await db.select().from(budgetLedger);
    expect(row).toMatchObject({ provider: "openai", tokensIn: 1 });
  });

  it("ElevenLabs Scribe risponde allo stesso modo", async () => {
    const heard = await gatedTranscript(
      gate(),
      new ElevenLabsTranscribe({ apiKey: "k", model: "scribe_v1", baseUrl: stub.baseUrl }),
      SECOND,
    );
    expect(heard.kind).toBe("text");
    expect(stub.completions[0]?.path).toBe("/v1/speech-to-text");
  });

  it("OpenRouter sente un input_audio", async () => {
    stub.nextResponse = { text: "che ore sono", cost: 0.0002 };
    const heard = await gatedTranscript(
      gate(),
      new OpenRouterTranscribe({ apiKey: "k", model: "openai/gpt-4o-audio-preview", baseUrl: stub.baseUrl }),
      SECOND,
    );
    expect(heard).toEqual({ kind: "text", text: "che ore sono" });
    const content = stub.completions[0]?.body.messages[0]?.content as { type: string }[];
    expect(content.map((p) => p.type)).toEqual(["text", "input_audio"]);
  });

  it("un enunciato troppo corto non si paga", async () => {
    const heard = await gatedTranscript(
      gate(),
      new OpenAiTranscribe({ apiKey: "k", model: "whisper-1", baseUrl: stub.baseUrl }),
      pcm16ToWav(Buffer.alloc(3200)),
    );
    expect(heard).toEqual({ kind: "unusable" });
    expect(stub.requests).toHaveLength(0);
  });

  it("a tetto finito il servizio è giù, non il clip", async () => {
    stub.nextResponse = { cost: 10 };
    await gatedSpeech(
      gate({ dailyBudgetUsd: 1 }),
      new OpenRouterSpeech({ apiKey: "k", model: "openai/gpt-4o-audio-preview", baseUrl: stub.baseUrl }),
      "spendo tutto",
      { voice: "alloy" },
    );
    const heard = await gatedTranscript(
      gate({ dailyBudgetUsd: 1 }),
      new OpenAiTranscribe({ apiKey: "k", model: "whisper-1", baseUrl: stub.baseUrl }),
      SECOND,
    );
    expect(heard).toEqual({ kind: "down" });
  });
});

describe("le voci da cui scegliere", () => {
  it("ElevenLabs le legge dall'account di chi ha la chiave", async () => {
    expect(await voicesFor("elevenlabs", "k", stub.baseUrl)).toEqual([
      { id: "voce-rachele", label: "Rachele" },
    ]);
    expect((await voicesFor("openai", undefined)).map((v) => v.id)).toContain("coral");
  });
});
