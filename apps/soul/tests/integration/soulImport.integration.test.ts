import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accessTokens,
  accounts,
  auditLog,
  beings,
  bonds,
  births,
  createDbClient,
  PRIME_ACCOUNT_ID,
  PRIME_GOSINO_ID,
  type DbClient,
  diaryEntries,
  events,
  games,
  gosini,
  houseChunks,
  houseDocuments,
  listItems,
  meetings,
  memories,
  memoryBeings,
  messages,
  psycheSnapshots,
  relations,
  rooms,
  runMigrations,
  transcriptSegments,
} from "@ugo/db";
import { embeddingFromSeed, startPostgres } from "@ugo/factories";
import { ArchiveError, decryptText, encryptText, EMBEDDING_DIMENSIONS, openSoulArchive, soulManifestSchema, unwrapDataKey, writeSoulArchive } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { exportSoulArchive } from "../../src/services/soulExport/exportSoul.js";
import { ImportRefusal } from "../../src/services/soulImport/errors.js";
import { importSoulArchive } from "../../src/services/soulImport/importSoul.js";
import { insertRows } from "../../src/services/soulImport/insertBatch.js";
import { inspectSoulArchive } from "../../src/services/soulImport/inspect.js";

/**
 * «A casa tua», l'importatore (ADR-132, MKT-10.5), su due database veri: una
 * casa ospitata (A) e un'installazione vuota (B) con un'ALTRA chiave master —
 * perché l'unico modo di provare che i testi sono ricifrati sotto la chiave
 * locale è che la chiave locale sia diversa.
 */

const MASTER_A = randomBytes(32);
const MASTER_B = randomBytes(32);
const SECRET = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01";
const KDF = { log2N: 10, r: 8, p: 1 } as const;
const EXPORT_DEPS = { masterKey: MASTER_A, generatorVersion: "test", embeddingModel: "openai/text-embedding-3-small", embeddingDimensions: EMBEDDING_DIMENSIONS, kdf: KDF, chunkLog2: 12 };
const IMPORT_DEPS = { masterKey: MASTER_B, embeddingModel: "openai/text-embedding-3-small" };

interface Handle { db: DbClient; stop: () => Promise<void> }
const handles: Handle[] = [];
let source: DbClient;
let houseId: string;
let creatureId: string;
let childId: string;

async function freshDatabase(): Promise<DbClient> {
  const started = await startPostgres();
  const container: StartedPostgreSqlContainer = started.container;
  await runMigrations(started.url);
  const db = createDbClient(started.url);
  handles.push({ db, stop: async () => { await db.$client.end(); await container.stop(); } });
  return db;
}

async function exportBytes(db: DbClient, accountId: string, gosinoIds: string[], master = MASTER_A): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await exportSoulArchive(db, { ...EXPORT_DEPS, masterKey: master }, { accountId, gosinoIds, mode: "trasloco", secret: SECRET }, (c) => {
    chunks.push(c);
    return Promise.resolve();
  });
  return Buffer.concat(chunks);
}

async function* feed(bytes: Buffer, piece = 7_000): AsyncGenerator<Buffer> {
  for (let at = 0; at < bytes.length; at += piece) {
    yield bytes.subarray(at, at + piece);
    await Promise.resolve();
  }
}

async function tablesOf(bytes: Buffer): Promise<Record<string, string[]>> {
  const archive = await openSoulArchive(feed(bytes), SECRET);
  const out: Record<string, string[]> = {};
  for await (const table of archive.tables) {
    const parts: Buffer[] = [];
    for await (const part of table.data) parts.push(part);
    const text = Buffer.concat(parts).toString("utf8");
    out[table.table] = text === "" ? [] : text.trimEnd().split("\n").sort();
  }
  return out;
}

const count = async (db: DbClient, table: string): Promise<number> =>
  ((await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`)) as unknown as { n: number }[])[0]?.n ?? -1;

/** A refused import leaves the installation exactly as migrations made it: the prime seed, nothing else. */
async function expectPristine(db: DbClient): Promise<void> {
  const ids = async (table: string): Promise<string[]> =>
    ((await db.execute(sql`select id::text as id from ${sql.identifier(table)}`)) as unknown as { id: string }[]).map((r) => r.id);
  expect(await ids("accounts"), "accounts").toEqual([PRIME_ACCOUNT_ID]);
  expect(await ids("gosini"), "gosini").toEqual([PRIME_GOSINO_ID]);
  for (const table of ["messages", "memories", "beings", "access_tokens", "events", "trait_sets", "diary_entries", "bonds"]) {
    expect(await count(db, table), `${table} must be untouched after a refused import`).toBe(0);
  }
  expect(await count(db, "rooms"), "the seeded room").toBe(1);
  expect(await count(db, "places"), "the seeded place").toBe(1);
}

async function refusal(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ImportRefusal) return `refusal:${error.code}`;
    if (error instanceof ArchiveError) return `archive:${error.code}`;
    throw error;
  }
  return "no-error";
}

beforeAll(async () => {
  source = await freshDatabase();
  const house = await createAccountWithFounder(source, MASTER_A, { slug: "casa-origine", name: "Origine", gosinoName: "Ugo" });
  houseId = house.accountId;
  creatureId = house.gosinoId;
  const [child] = await source.insert(gosini).values({ accountId: houseId, name: "Piccolo", parentGosinoId: creatureId, generation: 1, origin: "nato" }).returning({ id: gosini.id });
  childId = child?.id ?? "";
  await source.insert(births).values({ accountId: houseId, childGosinoId: childId, parentGosinoId: creatureId, weight: 1, signature: Buffer.from("firma"), parentPublicKey: Buffer.from("pubkey") });

  const g = creatureId;
  await source.insert(messages).values([
    { gosinoId: g, channel: "home" as const, role: "user", text: encryptText("ciao Ugo, sono Monika", MASTER_A) },
    { gosinoId: childId, channel: "home" as const, role: "user", text: encryptText("detto al piccolo", MASTER_A) },
  ]);
  const [m1] = await source.insert(memories).values({ gosinoId: g, kind: "fact" as const, text: "Il corriere passa il martedì", importance: 0.8, embedding: embeddingFromSeed(1) }).returning({ id: memories.id });
  await source.insert(memories).values([
    { gosinoId: g, kind: "insight" as const, text: encryptText("Le viti M3 tengono meglio", MASTER_A), importance: 0.9, supersededBy: m1?.id ?? null },
    { gosinoId: g, kind: "fact" as const, text: "v1: la prima versione è andata online", importance: 0.5 },
  ]);
  await source.insert(diaryEntries).values({ gosinoId: g, date: "2026-11-20", text: encryptText("oggi ho dormito poco", MASTER_A) });
  await source.insert(events).values({ gosinoId: g, source: "face" as const, type: "face_seen", payload: { n: 1 } });
  await source.insert(psycheSnapshots).values({ gosinoId: g, vars: { umore: 0.6 }, label: "sereno" });
  const [ivan] = await source.insert(beings).values({ accountId: houseId, displayName: "Ivan", aliases: ["il fattorino", "Ivan DHL"] }).returning({ id: beings.id });
  const [anna] = await source.insert(beings).values({ accountId: houseId, displayName: "Anna" }).returning({ id: beings.id });
  await source.insert(bonds).values({ accountId: houseId, gosinoId: g, beingId: ivan?.id ?? "" });
  await source.insert(relations).values({ accountId: houseId, beingA: ivan?.id ?? "", beingB: anna?.id ?? "", type: "cares_for" });
  const [memory] = await source.select({ id: memories.id }).from(memories).where(eq(memories.gosinoId, g)).limit(1);
  await source.insert(memoryBeings).values({ accountId: houseId, memoryId: memory?.id ?? "", beingId: ivan?.id ?? "" });
  await source.insert(listItems).values({ accountId: houseId, list: "spesa", text: encryptText("il latte", MASTER_A) });
  await source.insert(games).values({ accountId: houseId, gosinoId: g, kind: "guess", secret: encryptText("42", MASTER_A) });
  await source.insert(rooms).values({ accountId: houseId, name: "Cucina", slug: "cucina" });
  const [meeting] = await source.insert(meetings).values({ gosinoId: g, platform: "meet" }).returning({ id: meetings.id });
  await source.insert(transcriptSegments).values({ accountId: houseId, meetingId: meeting?.id ?? "", speaker: "Ivan", t0: 0, t1: 3, text: encryptText("buongiorno a tutti", MASTER_A), embedding: embeddingFromSeed(4) });
}, 300_000);

afterAll(async () => {
  await Promise.all(handles.map((handle) => handle.stop()));
});

describe("una casa che si sposta", () => {
  let target: DbClient;
  let archive: Buffer;
  let report: Awaited<ReturnType<typeof importSoulArchive>>;

  beforeAll(async () => {
    target = await freshDatabase();
    archive = await exportBytes(source, houseId, [creatureId]);
    report = await importSoulArchive(target, IMPORT_DEPS, feed(archive), SECRET, { skipEmbeddings: true });
  }, 300_000);

  it("la casa e la creatura arrivano con gli stessi id: è la stessa creatura", async () => {
    expect(report.accountId).toBe(houseId);
    expect(report.gosinoIds).toEqual([creatureId]);
    const [house] = await target.select().from(accounts).where(eq(accounts.id, houseId));
    expect(house?.slug).toBe("casa-origine");
    expect((await target.select().from(gosini)).map((g) => g.id)).toEqual([creatureId]);
  });

  it("i testi sono ricifrati con la chiave di QUESTA installazione, e con quella vecchia non si aprono", async () => {
    const stored = (await target.select().from(messages)).map((m) => m.text);
    expect(stored).toHaveLength(1);
    expect(decryptText(stored[0] ?? "", MASTER_B)).toBe("ciao Ugo, sono Monika");
    expect(() => decryptText(stored[0] ?? "", MASTER_A)).toThrow();
    const [diary] = await target.select().from(diaryEntries);
    expect(decryptText(diary?.text ?? "", MASTER_B)).toBe("oggi ho dormito poco");
    const [item] = await target.select().from(listItems);
    expect(decryptText(item?.text ?? "", MASTER_B)).toBe("il latte");
  });

  it("i ricordi tornano in chiaro come li scrive il runtime (ADR-091), anche quello che sembra un cifrato", async () => {
    const texts = (await target.select().from(memories)).map((m) => m.text).sort();
    expect(texts).toEqual(["Il corriere passa il martedì", "Le viti M3 tengono meglio", "v1: la prima versione è andata online"].sort());
  });

  it("nessun diritto di fondare o allevare arriva con la casa (regola 14)", async () => {
    const [house] = await target.select().from(accounts);
    expect(house?.isFoundry).toBe(false);
    expect(house?.canBreed).toBe(false);
  });

  it("la creatura ha una chiave dell'interiorità NUOVA, avvolta nella chiave locale; l'identità pubblica viaggia", async () => {
    const [local] = await target.select().from(gosini);
    const [original] = await source.select().from(gosini).where(eq(gosini.id, creatureId));
    expect(local?.wrappedSoulKey).not.toBeNull();
    expect(unwrapDataKey(local?.wrappedSoulKey ?? Buffer.alloc(0), MASTER_B)).toHaveLength(32);
    expect(local?.wrappedSoulKey).not.toEqual(original?.wrappedSoulKey);
    expect(local?.signingPublicKey).toEqual(original?.signingPublicKey);
    expect(local?.signingPrivateKey).toBeNull();
    expect(local?.peerEncounters).toBe(false);
  });

  it("la casa nuova ha UN token di proprietario, mostrato una volta; quelli della vecchia non sono passati", async () => {
    const tokens = await target.select().from(accessTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.role).toBe("owner");
    expect(report.ownerToken.length).toBeGreaterThan(20);
    expect(JSON.stringify(tokens)).not.toContain(report.ownerToken); // si conserva solo l'impronta
  });

  it("export → import → export: lo stesso contenuto, riga per riga (tranne l'evento di provenienza)", async () => {
    const again = await tablesOf(await exportBytes(target, houseId, [creatureId], MASTER_B));
    const original = await tablesOf(archive);
    expect(Object.keys(again).sort()).toEqual(Object.keys(original).sort());
    for (const [table, lines] of Object.entries(original)) {
      const mine = (again[table] ?? []).filter((line) => !(table === "events" && line.includes("soul_imported")));
      expect(mine, table).toEqual(lines);
    }
  });

  it("registra la provenienza con id e numeri, e l'atto nel giornale", async () => {
    const [event] = await target.select().from(events).where(eq(events.type, "soul_imported"));
    expect(event?.source).toBe("system");
    expect(JSON.stringify(event?.payload)).not.toMatch(/Ugo|Monika|martedì/u);
    const rows = await target.select().from(auditLog).where(eq(auditLog.verb, "soul_import"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resourceId).toBe(houseId);
  });

  it("senza vettori il resto funziona, e dice quanti ne mancano", () => {
    expect(report.embeddings.computed).toBe(0);
    expect(report.embeddings.pending).toBe(3 + 1); // tre ricordi e una trascrizione
  });

  it("non fonde mai: una seconda importazione nella stessa installazione è rifiutata, e non tocca niente", async () => {
    const before = await count(target, "messages");
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(archive), SECRET, { skipEmbeddings: true }))).toBe("refusal:target-not-empty");
    expect(await count(target, "messages")).toBe(before);
  });
});

describe("un archivio sbagliato non lascia mezza casa", () => {
  it("frase sbagliata: rifiutato prima di scrivere", async () => {
    const target = await freshDatabase();
    const archive = await exportBytes(source, houseId, [creatureId]);
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(archive), "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", { skipEmbeddings: true }))).toBe("archive:authentication-failed");
    await expectPristine(target);
  });

  it("manomesso verso la fine, quando metà della casa è già dentro: il rollback la riporta com'era", async () => {
    const target = await freshDatabase();
    const archive = Buffer.from(await exportBytes(source, houseId, [creatureId]));
    // più chunk: l'ultimo si autentica DOPO che i primi sono stati letti e scritti
    expect(archive.length, "the archive must span several chunks for this test to mean anything").toBeGreaterThan(4 * 4096);
    archive[archive.length - 5] = (archive[archive.length - 5] ?? 0) ^ 0x01; // l'ultimo chunk: il record d'integrità
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(archive), SECRET, { skipEmbeddings: true }))).toMatch(/^archive:/u);
    await expectPristine(target);
  });

  it("tagliato a metà: idem", async () => {
    const target = await freshDatabase();
    const archive = await exportBytes(source, houseId, [creatureId]);
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(archive.subarray(0, archive.length >> 1)), SECRET, { skipEmbeddings: true }))).toMatch(/^archive:/u);
    await expectPristine(target);
  });

  it("da una versione più nuova dello schema: «aggiorna prima UGO Casa», e non scrive niente", async () => {
    const target = await freshDatabase();
    const forged = await collect(writeSoulArchive({
      manifest: soulManifestSchema.parse({
        kind: "ugo-soul", formatVersion: { major: 1, minor: 0 }, createdAt: "2026-11-23T10:00:00.000Z",
        generator: { name: "ugo-soul", version: "futuro" }, mode: "trasloco",
        source: { schemaVersion: "9999_domani", embeddingModel: "x", embeddingDimensions: 768 },
        gosinoIds: [creatureId], omissions: [],
      }),
      tables: [{ table: "accounts", data: Buffer.from("{}\n") }],
      secret: SECRET, kdf: KDF,
    }));
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(forged), SECRET, { skipEmbeddings: true }))).toBe("refusal:incompatible");
    await expectPristine(target);
  });

  async function forge(tables: { table: string; data: Buffer }[]): Promise<Buffer> {
    return collect(writeSoulArchive({
      manifest: soulManifestSchema.parse({
        kind: "ugo-soul", formatVersion: { major: 1, minor: 0 }, createdAt: "2026-11-23T10:00:00.000Z",
        generator: { name: "ugo-soul", version: "test" }, mode: "trasloco",
        source: { schemaVersion: (await sourceTag()), embeddingModel: "openai/text-embedding-3-small", embeddingDimensions: 768 },
        gosinoIds: [creatureId], omissions: [],
      }),
      tables, secret: SECRET, kdf: KDF,
    }));
  }
  const sourceTag = async (): Promise<string> => (await import("@ugo/db")).latestMigrationTag();

  it("una tabella che in un archivio non c'entra (le chiavi d'accesso): rifiutato", async () => {
    const target = await freshDatabase();
    const forged = await forge([{ table: "access_tokens", data: Buffer.from('{"token_hash":"x"}\n') }]);
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(forged), SECRET, { skipEmbeddings: true }))).toBe("refusal:unknown-table");
    await expectPristine(target);
  });

  it("senza la casa in testa: rifiutato", async () => {
    const target = await freshDatabase();
    const forged = await forge([{ table: "messages", data: Buffer.from('{"id":"1"}\n') }]);
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(forged), SECRET, { skipEmbeddings: true }))).toBe("refusal:no-house");
  });

  it("una riga che punta a una riga assente, fuori ordine: un rifiuto pulito, senza i valori nel messaggio", async () => {
    const target = await freshDatabase();
    const accountRow = JSON.stringify({ id: houseId, slug: "x", name: "X" }) + "\n";
    const message = JSON.stringify({ id: "11111111-2222-4333-8444-555555555555", gosino_id: "99999999-2222-4333-8444-555555555555", channel: "home", role: "user", text: "segretissimo" }) + "\n";
    const forged = await forge([{ table: "accounts", data: Buffer.from(accountRow) }, { table: "messages", data: Buffer.from(message) }]);
    try {
      await importSoulArchive(target, IMPORT_DEPS, feed(forged), SECRET, { skipEmbeddings: true });
      expect.unreachable("must refuse");
    } catch (error) {
      expect(error).toBeInstanceOf(ImportRefusal);
      expect((error as ImportRefusal).code).toBe("table-order");
      expect((error as Error).message).not.toMatch(/9999|segretissimo/u);
    }
    await expectPristine(target);
  });
});

describe("l'anteprima, prima di scrivere", () => {
  const runtime = { schemaVersion: "", embeddingModel: "openai/text-embedding-3-small" };

  it("dice cosa c'è e quanto costerà ricalcolare i vettori, senza toccare nessun database", async () => {
    const { latestMigrationTag } = await import("@ugo/db");
    const archive = await exportBytes(source, houseId, [creatureId]);
    const preview = await inspectSoulArchive(feed(archive), SECRET, { ...runtime, schemaVersion: latestMigrationTag() });
    expect(preview.manifest.gosinoIds).toEqual([creatureId]);
    expect(preview.compatibility).toMatchObject({ ok: true });
    expect(preview.tables.find((t) => t.table === "messages")?.rows).toBe(1);
    // tre ricordi e una trascrizione, come nel rapporto dell'import vero
    expect(preview.embeddings.rows).toBe(4);
    expect(preview.embeddings.estimatedTokens).toBeGreaterThan(0);
    expect(preview.embeddings.estimatedUsd).toBeGreaterThan(0);
    expect(preview.embeddings.estimatedUsd).toBeLessThan(0.001); // una casa vera costa frazioni di centesimo
    expect(preview.embeddings.basis).toMatch(/stima/u);
  });

  it("legge tutto il file, quindi lo prova integro: un archivio manomesso non passa l'anteprima", async () => {
    const archive = Buffer.from(await exportBytes(source, houseId, [creatureId]));
    archive[archive.length - 5] = (archive[archive.length - 5] ?? 0) ^ 0x01;
    await expect(inspectSoulArchive(feed(archive), SECRET, runtime)).rejects.toBeInstanceOf(ArchiveError);
  });

  it("e con la frase sbagliata non dice niente di ciò che contiene", async () => {
    const archive = await exportBytes(source, houseId, [creatureId]);
    await expect(inspectSoulArchive(feed(archive), "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", runtime)).rejects.toMatchObject({ code: "authentication-failed" });
  });

  it("dice «no» a una versione che non può prendere, prima ancora di cominciare", async () => {
    const archive = await exportBytes(source, houseId, [creatureId]);
    const preview = await inspectSoulArchive(feed(archive), SECRET, { ...runtime, schemaVersion: "0001_vecchia" });
    expect(preview.compatibility).toMatchObject({ ok: false, reason: "archive-from-newer-schema" });
  });
});

describe("i riferimenti che l'archivio non porta", () => {
  it("una creatura scelta senza il genitore: il riferimento si svuota, il certificato di nascita non può esistere, e il rapporto lo dice", async () => {
    const target = await freshDatabase();
    const archive = await exportBytes(source, houseId, [childId]);
    const report = await importSoulArchive(target, IMPORT_DEPS, feed(archive), SECRET, { skipEmbeddings: true });
    const [child] = await target.select().from(gosini);
    expect(child?.id).toBe(childId);
    expect(child?.parentGosinoId).toBeNull();
    expect(child?.origin).toBe("nato"); // l'origine viaggia: non si perde da dove viene
    expect(report.nulledReferences).toContainEqual({ table: "gosini", column: "parent_gosino_id", rows: 1 });
    expect(report.tables.find((t) => t.table === "births")).toMatchObject({ inserted: 0, skipped: 1 });
    expect(await count(target, "births")).toBe(0);
  });

  it("un riferimento a se stessa dentro l'archivio si ripristina (un ricordo sostituito da un altro)", async () => {
    const target = await freshDatabase();
    await importSoulArchive(target, IMPORT_DEPS, feed(await exportBytes(source, houseId, [creatureId])), SECRET, { skipEmbeddings: true });
    const rows = await target.select().from(memories).where(sql`superseded_by is not null`);
    expect(rows).toHaveLength(1);
  });
});

describe("i vettori", () => {
  it("righe che non possono esistere senza un vettore, e niente per calcolarlo: rifiutato e rimesso a posto", async () => {
    const withChunks = await freshDatabase();
    const house = await createAccountWithFounder(withChunks, MASTER_A, { slug: "con-documenti", name: "Doc", gosinoName: "Docu" });
    const [doc] = await withChunks.insert(houseDocuments).values({ accountId: house.accountId, s3Key: "docs/a", filename: encryptText("libretto.pdf", MASTER_A), mime: "application/pdf" }).returning({ id: houseDocuments.id });
    await withChunks.insert(houseChunks).values({ accountId: house.accountId, documentId: doc?.id ?? "", ref: "p1", text: encryptText("La caldaia va spurgata ogni autunno", MASTER_A), embedding: embeddingFromSeed(9) });
    const archive = await exportBytes(withChunks, house.accountId, [house.gosinoId]);
    const target = await freshDatabase();
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(archive), SECRET, { skipEmbeddings: true }))).toBe("refusal:needs-embedder");
    expect(await refusal(() => importSoulArchive(target, IMPORT_DEPS, feed(archive), SECRET))).toBe("refusal:needs-embedder");
    await expectPristine(target);
  });

  it("un vettore passa da JSON a colonna con le funzioni di Postgres, a 768 dimensioni", async () => {
    const target = await freshDatabase();
    const house = await createAccountWithFounder(target, MASTER_B, { slug: "vettori", name: "V", gosinoName: "Vec" });
    await insertRows(target, "memories", [{ gosino_id: house.gosinoId, kind: "fact", text: "un ricordo", importance: 0.5, embedding: embeddingFromSeed(3) }]);
    const rows = (await target.execute(sql`select vector_dims(embedding) as d from memories`)) as unknown as { d: number }[];
    expect(rows[0]?.d).toBe(EMBEDDING_DIMENSIONS);
  });
});

async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}
