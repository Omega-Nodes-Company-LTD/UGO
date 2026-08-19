import { randomBytes } from "node:crypto";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  createDbClient,
  type DbClient,
  diaryEntries,
  events,
  meetings,
  memories,
  messages,
  PRIME_GOSINO_ID,
  PRIME_ACCOUNT_ID,
  runMigrations,
  transcriptSegments,
} from "@ugo/db";
import { EMBED_MODEL, startOllama, startPostgres, type OllamaHandle } from "@ugo/factories";
import { OllamaEmbeddingsClient, searchMemories, writeMemory } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExportService } from "../../src/services/privacy/exportService.js";
import { ForgetService, BeingNotFoundError } from "../../src/services/privacy/forgetService.js";
import { REDACTION } from "../../src/services/privacy/redaction.js";
import { addBeing, createHouse, type TestHouse } from "./helpers/tenancy.js";

// GDPR erasure on real infrastructure: real Postgres+pgvector and real
// embeddings, because the whole point is that nothing identifying survives —
// including inside the vectors.

const dataKey = randomBytes(32);
let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;
let beingId: string;
let strangerId: string;

beforeAll(async () => {
  const [postgres, ollamaHandle] = await Promise.all([startPostgres(), startOllama()]);
  pg = postgres.container;
  ollama = ollamaHandle;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);

  const [ivan] = await db
    .insert(beings)
    .values({ accountId: PRIME_ACCOUNT_ID, displayName: "Ivan Bianchi", aliases: ["Ivan", "Vanni"], notes: "corriere DHL" })
    .returning({ id: beings.id });
  const [paola] = await db
    .insert(beings)
    .values({ accountId: PRIME_ACCOUNT_ID, displayName: "Paola Verdi", aliases: ["Paola"] })
    .returning({ id: beings.id });
  if (ivan === undefined || paola === undefined) throw new Error("beings insert failed");
  beingId = ivan.id;
  strangerId = paola.id;

  await db.insert(messages).values([
    { gosinoId: PRIME_GOSINO_ID, channel: "home", role: "user", beingId, text: encryptText("Ivan Bianchi ha portato il pacco", dataKey) },
    { gosinoId: PRIME_GOSINO_ID, channel: "home", role: "assistant", text: encryptText("Grunf, ringrazio Ivan!", dataKey) },
    // a turn belonging to someone else that still names the erased person
    { gosinoId: PRIME_GOSINO_ID, channel: "home", role: "user", beingId: strangerId, text: encryptText("Paola: ieri Vanni era di corsa", dataKey) },
    { gosinoId: PRIME_GOSINO_ID, channel: "home", role: "user", beingId: strangerId, text: encryptText("Paola parla del meteo", dataKey) },
  ]);

  const [meeting] = await db
    .insert(meetings)
    .values({ gosinoId: PRIME_GOSINO_ID, platform: "ear", title: "consegna", status: "archived" })
    .returning({ id: meetings.id });
  if (meeting === undefined) throw new Error("meeting insert failed");
  await db.insert(transcriptSegments).values({
    accountId: PRIME_ACCOUNT_ID,
    meetingId: meeting.id,
    speaker: "Ivan",
    t0: 0,
    t1: 3,
    text: encryptText("Sono Ivan, lascio il pacco in portineria", dataKey),
  });

  await writeMemory(db, embedder, {
    gosinoId: PRIME_GOSINO_ID,
    kind: "fact",
    text: "Il corriere DHL di zona si chiama Ivan Bianchi e passa il martedì.",
    importance: 0.9,
  });
  await writeMemory(db, embedder, {
    gosinoId: PRIME_GOSINO_ID,
    kind: "fact",
    text: "La lavatrice fa un rumore strano in centrifuga.",
    importance: 0.5,
  });
  await db.insert(diaryEntries).values({
    gosinoId: PRIME_GOSINO_ID,
    date: "2026-08-06",
    text: "Oggi Ivan ha portato un pacco e mi sono divertito.",
  });
  await db.insert(events).values({
    gosinoId: PRIME_GOSINO_ID,
    source: "face",
    type: "face_seen",
    payload: { who: "Ivan", confidence: 0.8 },
  });
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop()]);
});

describe("forgetBeing — anonimizzazione irreversibile (§7)", () => {
  it("erases the person and every trace of the name, keeping the experience", async () => {
    const service = new ForgetService({ db, dataKey, embedder });
    const report = await service.forgetBeing(beingId, PRIME_ACCOUNT_ID);

    expect(report.messagesRedacted).toBe(3); // includes the stranger's turn
    expect(report.segmentsRedacted).toBe(1);
    expect(report.speakersRedacted).toBe(1);
    expect(report.memoriesRedacted).toBe(1);
    expect(report.memoriesReEmbedded).toBe(1);
    expect(report.diaryRedacted).toBe(1);
    expect(report.eventsRedacted).toBe(1);

    // the person is gone
    expect(await db.select().from(beings).where(eq(beings.id, beingId))).toHaveLength(0);

    // the biography survives, anonymized: no name anywhere, nothing deleted
    const messageRows = await db.select().from(messages);
    expect(messageRows).toHaveLength(4); // append-only: rows are not destroyed
    const plaintexts = messageRows.map((row) => decryptText(row.text, dataKey));
    expect(plaintexts.join(" | ")).not.toMatch(/ivan|vanni/i);
    expect(plaintexts.some((text) => text.includes(REDACTION))).toBe(true);
    // the unrelated person is untouched
    expect(plaintexts).toContain("Paola parla del meteo");
    // the link is broken too
    expect(messageRows.filter((row) => row.beingId === beingId)).toHaveLength(0);

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
    const [audit] = await db.select().from(events).where(eq(events.type, "being_forgotten"));
    expect(audit).toBeDefined();
    const payload = JSON.stringify(audit?.payload);
    expect(payload).toContain(beingId);
    expect(payload).not.toMatch(/ivan|bianchi|vanni/i);
  });

  it("rejects an unknown being id", async () => {
    const service = new ForgetService({ db, dataKey });
    await expect(
      service.forgetBeing(crypto.randomUUID(), PRIME_ACCOUNT_ID),
    ).rejects.toThrow(BeingNotFoundError);
  });
});

describe("exportAll — portabilità (SECURITY §3)", () => {
  it("returns every table with message bodies decrypted", async () => {
    const bundle = await new ExportService(db, dataKey).exportAll(PRIME_ACCOUNT_ID);
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundle.beings).toHaveLength(1); // only the surviving being
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
    const bundle = await new ExportService(db, randomBytes(32)).exportAll(PRIME_ACCOUNT_ID);
    expect(JSON.stringify(bundle.messages)).toContain("non decifrabile");
  });
});

/**
 * ADR-019 phase 2, and the reason this commit exists: before it, `exportAll`
 * handed over the whole database in the clear and `forgetBeing` rewrote text
 * in every house that happened to contain the same name.
 */
describe("il confine di casa", () => {
  let vicini: TestHouse;
  let loroIvan: string;
  let nostroIvan: string;
  const LORO_FRASE = "Ivan Neri ha innaffiato le piante";

  beforeAll(async () => {
    vicini = await createHouse(db, "casa-vicini-privacy", { name: "i vicini" });
    loroIvan = await addBeing(db, vicini, "Ivan Neri");
    await db.insert(messages).values({
      gosinoId: vicini.gosinoId,
      channel: "home",
      role: "user",
      beingId: loroIvan,
      text: encryptText(LORO_FRASE, dataKey),
    });
    await db.insert(diaryEntries).values({
      gosinoId: vicini.gosinoId,
      date: "2026-08-07",
      text: "Ivan Neri è passato anche oggi.",
    });

    // and one of ours, with a name that collides on purpose
    const [ours] = await db
      .insert(beings)
      .values({ accountId: PRIME_ACCOUNT_ID, displayName: "Ivan Neri", aliases: ["Ivan"] })
      .returning({ id: beings.id });
    if (ours === undefined) throw new Error("our being was not created");
    nostroIvan = ours.id;
  });

  it("refuses to erase a being of another house, and does not admit it exists", async () => {
    const service = new ForgetService({ db, dataKey });
    await expect(service.forgetBeing(loroIvan, PRIME_ACCOUNT_ID)).rejects.toThrow(
      BeingNotFoundError,
    );
  });

  it("erases our namesake without touching a word of theirs", async () => {
    const service = new ForgetService({ db, dataKey });
    await service.forgetBeing(nostroIvan, PRIME_ACCOUNT_ID);

    const [theirMessage] = await db
      .select({ text: messages.text })
      .from(messages)
      .where(eq(messages.gosinoId, vicini.gosinoId));
    expect(decryptText(theirMessage?.text ?? "", dataKey)).toBe(LORO_FRASE);

    const [theirDiary] = await db
      .select({ text: diaryEntries.text })
      .from(diaryEntries)
      .where(eq(diaryEntries.gosinoId, vicini.gosinoId));
    expect(theirDiary?.text).toContain("Ivan Neri");
  });

  it("exports one house and not a single id of the other", async () => {
    const exporter = new ExportService(db, dataKey);
    const ours = JSON.stringify(await exporter.exportAll(PRIME_ACCOUNT_ID));
    expect(ours).not.toContain(vicini.gosinoId);
    expect(ours).not.toContain(loroIvan);
    expect(ours).not.toContain(LORO_FRASE);

    // and the mirror image, so the test cannot pass by exporting nothing
    const theirs = await exporter.exportAll(vicini.id);
    expect(theirs.beings).toHaveLength(1);
    expect(JSON.stringify(theirs.messages)).toContain(LORO_FRASE);
    expect(JSON.stringify(theirs)).not.toContain(strangerId);
  });
});
