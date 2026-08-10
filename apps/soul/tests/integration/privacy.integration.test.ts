import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  diaryEntries,
  events,
  meetings,
  memories,
  messages,
  people,
  runMigrations,
  transcriptSegments,
  type DbClient,
} from "@ugo/db";
import { EMBED_MODEL, startOllama, type OllamaHandle } from "@ugo/factories";
import { OllamaEmbeddingsClient, searchMemories, writeMemory } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExportService } from "../../src/services/privacy/exportService.js";
import { ForgetService, PersonNotFoundError } from "../../src/services/privacy/forgetService.js";
import { REDACTION } from "../../src/services/privacy/redaction.js";

// GDPR erasure on real infrastructure: real Postgres+pgvector and real
// embeddings, because the whole point is that nothing identifying survives —
// including inside the vectors.

const dataKey = randomBytes(32);
let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;
let personId: string;
let strangerId: string;

beforeAll(async () => {
  [pg, ollama] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);

  const [ivan] = await db
    .insert(people)
    .values({ displayName: "Ivan Bianchi", aliases: ["Ivan", "Vanni"], notes: "corriere DHL" })
    .returning({ id: people.id });
  const [paola] = await db
    .insert(people)
    .values({ displayName: "Paola Verdi", aliases: ["Paola"] })
    .returning({ id: people.id });
  if (ivan === undefined || paola === undefined) throw new Error("people insert failed");
  personId = ivan.id;
  strangerId = paola.id;

  await db.insert(messages).values([
    { channel: "home", role: "user", personId, text: encryptText("Ivan Bianchi ha portato il pacco", dataKey) },
    { channel: "home", role: "assistant", text: encryptText("Grunf, ringrazio Ivan!", dataKey) },
    // a turn belonging to someone else that still names the erased person
    { channel: "home", role: "user", personId: strangerId, text: encryptText("Paola: ieri Vanni era di corsa", dataKey) },
    { channel: "home", role: "user", personId: strangerId, text: encryptText("Paola parla del meteo", dataKey) },
  ]);

  const [meeting] = await db
    .insert(meetings)
    .values({ platform: "ear", title: "consegna", status: "archived" })
    .returning({ id: meetings.id });
  if (meeting === undefined) throw new Error("meeting insert failed");
  await db.insert(transcriptSegments).values({
    meetingId: meeting.id,
    speaker: "Ivan",
    t0: 0,
    t1: 3,
    text: encryptText("Sono Ivan, lascio il pacco in portineria", dataKey),
  });

  await writeMemory(db, embedder, {
    kind: "fact",
    text: "Il corriere DHL di zona si chiama Ivan Bianchi e passa il martedì.",
    importance: 0.9,
  });
  await writeMemory(db, embedder, {
    kind: "fact",
    text: "La lavatrice fa un rumore strano in centrifuga.",
    importance: 0.5,
  });
  await db.insert(diaryEntries).values({
    date: "2026-08-06",
    text: "Oggi Ivan ha portato un pacco e mi sono divertito.",
  });
  await db.insert(events).values({
    source: "face",
    type: "face_seen",
    payload: { who: "Ivan", confidence: 0.8 },
  });
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop()]);
});

describe("forgetPerson — anonimizzazione irreversibile (§7)", () => {
  it("erases the person and every trace of the name, keeping the experience", async () => {
    const service = new ForgetService({ db, dataKey, embedder });
    const report = await service.forgetPerson(personId);

    expect(report.messagesRedacted).toBe(3); // includes the stranger's turn
    expect(report.segmentsRedacted).toBe(1);
    expect(report.speakersRedacted).toBe(1);
    expect(report.memoriesRedacted).toBe(1);
    expect(report.memoriesReEmbedded).toBe(1);
    expect(report.diaryRedacted).toBe(1);
    expect(report.eventsRedacted).toBe(1);

    // the person is gone
    expect(await db.select().from(people).where(eq(people.id, personId))).toHaveLength(0);

    // the biography survives, anonymized: no name anywhere, nothing deleted
    const messageRows = await db.select().from(messages);
    expect(messageRows).toHaveLength(4); // append-only: rows are not destroyed
    const plaintexts = messageRows.map((row) => decryptText(row.text, dataKey));
    expect(plaintexts.join(" | ")).not.toMatch(/ivan|vanni/i);
    expect(plaintexts.some((text) => text.includes(REDACTION))).toBe(true);
    // the unrelated person is untouched
    expect(plaintexts).toContain("Paola parla del meteo");
    // the link is broken too
    expect(messageRows.filter((row) => row.personId === personId)).toHaveLength(0);

    const [segment] = await db.select().from(transcriptSegments);
    expect(segment?.speaker).toBe(REDACTION);
    expect(decryptText(segment?.text ?? "", dataKey)).not.toMatch(/ivan/i);

    const memoryRows = await db.select().from(memories);
    expect(memoryRows.map((row) => row.text).join(" ")).not.toMatch(/ivan|bianchi/i);
    expect(memoryRows.some((row) => row.text.includes("martedì"))).toBe(true); // fact kept

    const [diary] = await db.select().from(diaryEntries);
    expect(diary?.text).not.toMatch(/ivan/i);

    const faceEvents = await db.select().from(events).where(eq(events.type, "face_seen"));
    expect(JSON.stringify(faceEvents[0]?.payload)).not.toMatch(/ivan/i);
  });

  it("re-embeds so the name is unrecoverable through semantic search", async () => {
    const results = await searchMemories(db, embedder, "chi è Ivan Bianchi?", 5);
    for (const memory of results) {
      expect(memory.text).not.toMatch(/ivan|bianchi/i);
    }
  });

  it("writes an audit event with ids only, never the erased name", async () => {
    const [audit] = await db.select().from(events).where(eq(events.type, "person_forgotten"));
    expect(audit).toBeDefined();
    const payload = JSON.stringify(audit?.payload);
    expect(payload).toContain(personId);
    expect(payload).not.toMatch(/ivan|bianchi|vanni/i);
  });

  it("rejects an unknown person id", async () => {
    const service = new ForgetService({ db, dataKey });
    await expect(service.forgetPerson(crypto.randomUUID())).rejects.toThrow(PersonNotFoundError);
  });
});

describe("exportAll — portabilità (SECURITY §3)", () => {
  it("returns every table with message bodies decrypted", async () => {
    const bundle = await new ExportService(db, dataKey).exportAll();
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundle.people).toHaveLength(1); // only the surviving person
    expect(bundle.messages).toHaveLength(4);
    const serialized = JSON.stringify(bundle.messages);
    expect(serialized).toContain("Paola parla del meteo"); // decrypted, not "v1:"
    expect(serialized).not.toContain("v1:");
    expect(bundle.memories.length).toBeGreaterThan(0);
    expect(bundle.transcriptSegments).toHaveLength(1);
    expect(bundle.budgetLedger).toBeDefined();
    expect(bundle.psycheSnapshots).toBeDefined();
  });

  it("degrades gracefully when a row cannot be decrypted", async () => {
    const bundle = await new ExportService(db, randomBytes(32)).exportAll();
    expect(JSON.stringify(bundle.messages)).toContain("non decifrabile");
  });
});
