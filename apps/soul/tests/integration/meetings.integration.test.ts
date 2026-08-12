import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  events,
  meetings,
  memories,
  messages,
  runMigrations,
  transcriptSegments,
  PRIME_GOSINO_ID,
  type DbClient,
} from "@ugo/db";
import {
  EMBED_MODEL,
  startLlmStub,
  startOllama,
  startVexaStub,
  type LlmStub,
  type OllamaHandle,
  type VexaStub,
} from "@ugo/factories";
import { LlmClient, OllamaEmbeddingsClient, writeMemory } from "@ugo/memory";
import { decryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MeetingsService, parseMeetingUrl } from "../../src/services/meetingsService.js";

// Fase 5 integration side on the REAL Vexa open-core v0.12 contract
// (ADR-013): the Vexa stack itself is a network-level stub (a real stack
// needs a headless-Chrome fleet joining a live Meet); Postgres, pgvector and
// the embeddings are real.

const dataKey = randomBytes(32);
const MEET_URL = "https://meet.google.com/abc-defg-hij";

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let vexa: VexaStub;
let llmStub: LlmStub;
let db: DbClient;
let service: MeetingsService;
const spoken: string[] = []; // ADR-013: SpeakPort capture (in-room voice)
const perturbed: string[] = []; // psyche events raised by the meeting lifecycle

beforeAll(async () => {
  [pg, ollama, vexa, llmStub] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
    startVexaStub(),
    startLlmStub(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  const embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);
  service = new MeetingsService({
    db,
    gosinoId: PRIME_GOSINO_ID,
    embedder,
    llm: new LlmClient({
      db,
      apiKey: "test",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 5,
      baseUrl: llmStub.baseUrl,
    }),
    dataKey,
    vexa: { baseUrl: vexa.baseUrl, apiKey: "vxa_test_key", ownerName: "Omega" },
    psyche: {
      applyEventType: (type) => {
        perturbed.push(type);
        return Promise.resolve();
      },
    },
    speakPort: {
      speak: (_ref, text) => {
        spoken.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop(), vexa.close(), llmStub.close()]);
});

describe("url parsing", () => {
  it("recognizes Meet codes and rejects the rest", () => {
    expect(parseMeetingUrl(MEET_URL)).toEqual({ platform: "google_meet", nativeId: "abc-defg-hij" });
    expect(() => parseMeetingUrl("https://meet.google.com/not-valid")).toThrow(/Meet/);
    expect(() => parseMeetingUrl("https://zoom.example.com/j/123")).toThrow(/unsupported/);
  });
});

describe("join → poll → answer → stop (Vexa open-core contract)", () => {
  it("join sends the bot with the UGO display name and records the meeting", async () => {
    const ref = await service.join(MEET_URL, "riunione di prova");
    expect(vexa.lastApiKey).toBe("vxa_test_key");
    const created = vexa.botsCreated.at(-1);
    expect(created).toMatchObject({ platform: "google_meet", native_meeting_id: "abc-defg-hij" });
    expect(String(created?.bot_name)).toContain("UGO");
    expect(String(created?.bot_name)).toContain("Omega");

    const [row] = await db.select().from(meetings).where(eq(meetings.id, ref.meetingId));
    expect(row?.status).toBe("live");
    expect(row?.title).toBe("riunione di prova");
  });

  it("polling ingests only the new tail, encrypted and embedded", async () => {
    const ref = service.active()[0];
    expect(ref).toBeDefined();
    if (ref === undefined) return;

    vexa.segments = [
      { speaker: "Ivan", start: 1, end: 4, text: "La consegna dei gusci slitta a giovedì." },
      { speaker: "Paola", start: 5, end: 7, text: "Va bene, aggiorno il piano di stampa." },
    ];
    expect(await service.pollOnce(ref)).toBe(2);
    expect(await service.pollOnce(ref)).toBe(0); // same transcript: nothing new

    vexa.segments.push({ speaker: "Ivan", start: 8, end: 9, text: "Confermo giovedì mattina." });
    expect(await service.pollOnce(ref)).toBe(1);

    const rows = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, ref.meetingId));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.text.startsWith("v1:")).toBe(true);
      expect(row.embedding).toHaveLength(768);
    }
    expect(decryptText(rows[0]?.text ?? "", dataKey)).toContain("slitta a giovedì");
    expect(rows[0]?.speaker).toBe("Ivan");
  });

  it("answers a name+question mention once, with meeting limits and rate-limit", async () => {
    const ref = service.active()[0];
    if (ref === undefined) throw new Error("no active meeting");
    await writeMemory(
      db,
      new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL),
      { kind: "fact", text: "La scorsa riunione si era deciso di stampare i gusci in PETG.", importance: 0.9 },
    );

    llmStub.nextResponse = { text: "Nella scorsa call avevate scelto il PETG. Grunf." };
    const at = new Date();
    vexa.segments.push({
      speaker: "Paola",
      start: 10,
      end: 12,
      text: "UGO, cosa avevamo deciso sul materiale dei gusci?",
    });
    expect(await service.pollOnce(ref, at)).toBe(1);

    const captured = llmStub.requests.at(-1);
    expect(captured?.body.max_tokens).toBe(300); // canale meeting (§5.5)
    expect(captured?.body.system[2]?.text).toContain("PETG");

    // second mention 30s later: rate limit 1/2min holds
    vexa.segments.push({
      speaker: "Paola",
      start: 13,
      end: 15,
      text: "UGO, ci sei ancora? altra domanda?",
    });
    const providerCalls = llmStub.requests.length;
    expect(await service.pollOnce(ref, new Date(at.getTime() + 30_000))).toBe(1);
    expect(llmStub.requests.length).toBe(providerCalls); // no new provider call

    const assistantRows = await db.select().from(messages).where(eq(messages.channel, "meeting"));
    expect(assistantRows).toHaveLength(1);
    expect(decryptText(assistantRows[0]?.text ?? "", dataKey)).toContain("PETG");
    expect((await db.select().from(budgetLedger)).length).toBeGreaterThanOrEqual(1);
    // ADR-013 opzione b: la risposta è stata instradata alla voce in stanza
    expect(spoken).toEqual(["Nella scorsa call avevate scelto il PETG. Grunf."]);
  });

  it("stop leaves the call, closes the meeting and leaves a digest behind", async () => {
    const ref = service.active()[0];
    if (ref === undefined) throw new Error("no active meeting");
    llmStub.nextResponse = {
      text: "Si è deciso di stampare i gusci in PETG; consegna confermata a giovedì mattina.",
    };
    await service.stop(ref);

    expect(vexa.botsDeleted.at(-1)).toBe("/bots/google_meet/abc-defg-hij");
    const [row] = await db.select().from(meetings).where(eq(meetings.id, ref.meetingId));
    expect(row?.status).toBe("ended");
    expect(row?.endedAt).not.toBeNull();
    expect(service.active()).toHaveLength(0);

    // a finished meeting feeds curiosity and is journaled (§4.3, §5.3)
    expect(perturbed).toContain("meeting_completed");
    const completed = await db.select().from(events).where(eq(events.type, "meeting_completed"));
    expect(completed).toHaveLength(1);

    // the digest is a real memory, embedded, available before the night job
    const digests = await db.select().from(memories).where(eq(memories.kind, "insight"));
    expect(digests).toHaveLength(1);
    expect(digests[0]?.text).toContain("PETG");
    expect(digests[0]?.text).toContain("riunione di prova");
    expect(digests[0]?.embedding).toHaveLength(768);
    expect(JSON.stringify(digests[0]?.sourceRefs)).toContain(ref.meetingId);
  });
});
