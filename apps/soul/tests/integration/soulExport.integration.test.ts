import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accessTokens,
  accounts,
  auditLog,
  beings,
  bonds,
  createDbClient,
  customers,
  type DbClient,
  desires,
  diaryEntries,
  events,
  games,
  gosini,
  latestMigrationTag,
  listItems,
  meetings,
  memories,
  memoryBeings,
  messages,
  perceptionEvents,
  photos,
  psycheSnapshots,
  recognitionProfiles,
  relations,
  rooms,
  runMigrations,
  transcriptSegments,
  unknownPrints,
} from "@ugo/db";
import { embeddingFromSeed, startPostgres } from "@ugo/factories";
import { ArchiveError, encryptText, openSoulArchive, unwrapDataKey, wrapDataKey } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { exportSoulArchive, ExportRefusal, type ExportDeps } from "../../src/services/soulExport/exportSoul.js";
import { StrayCiphertextError, UndecryptableError } from "../../src/services/soulExport/rowCrypto.js";

/**
 * «A casa tua», lo scrittore dell'archivio (ADR-132, MKT-10.3), su database
 * vero: cifratura vera con tre chiavi diverse, due case, due creature.
 */

const MASTER = randomBytes(32);
const SOUL_KEY = randomBytes(32);
const SECRET = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01";
const KDF = { log2N: 10, r: 8, p: 1 } as const;
const deps: ExportDeps = {
  masterKey: MASTER,
  generatorVersion: "test",
  embeddingModel: "openai/text-embedding-3-small",
  embeddingDimensions: 768,
  kdf: KDF,
};

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let houseA: { accountId: string; gosinoId: string };
let houseB: { accountId: string; gosinoId: string };
let second: string; // second creature of house A
let houseKey: Buffer;

async function exportBytes(accountId: string, gosinoIds: string[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await exportSoulArchive(db, deps, { accountId, gosinoIds, mode: "trasloco", secret: SECRET }, (chunk) => {
    chunks.push(chunk);
    return Promise.resolve();
  });
  return Buffer.concat(chunks);
}

async function readArchive(bytes: Buffer) {
  const archive = await openSoulArchive(
    (async function* () {
      await Promise.resolve();
      yield bytes;
    })(),
    SECRET,
  );
  const tables: Record<string, Record<string, unknown>[]> = {};
  for await (const table of archive.tables) {
    const parts: Buffer[] = [];
    for await (const part of table.data) parts.push(part);
    const text = Buffer.concat(parts).toString("utf8");
    tables[table.table] = text === "" ? [] : text.trimEnd().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  }
  return { manifest: archive.manifest, tables, integrity: archive.integrity() };
}

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  houseA = await createAccountWithFounder(db, MASTER, { slug: "casa-a", name: "Casa A", gosinoName: "Ugo" });
  houseB = await createAccountWithFounder(db, MASTER, { slug: "casa-b", name: "Casa B", gosinoName: "Vicino" });
  const [row] = await db.select({ w: accounts.wrappedDataKey }).from(accounts).where(eq(accounts.id, houseA.accountId));
  if (row?.w == null) throw new Error("la casa non ha la sua chiave");
  houseKey = unwrapDataKey(row.w, MASTER);

  const [other] = await db.insert(gosini).values({ accountId: houseA.accountId, name: "Secondo" }).returning({ id: gosini.id });
  second = other?.id ?? "";
  // la sua interiorità ha una chiave sua (ADR-075)
  await db.update(gosini).set({ wrappedSoulKey: wrapDataKey(SOUL_KEY, MASTER) }).where(eq(gosini.id, houseA.gosinoId));

  const a = houseA.accountId;
  const g = houseA.gosinoId;
  await db.insert(messages).values([
    { gosinoId: g, channel: "home" as const, role: "user", text: encryptText("scritto con la chiave master", MASTER) },
    { gosinoId: g, channel: "home" as const, role: "assistant", text: encryptText("scritto con la chiave di casa", houseKey) },
    { gosinoId: g, channel: "home" as const, role: "user", text: encryptText("scritto con la chiave sua", SOUL_KEY) },
    { gosinoId: second, channel: "home" as const, role: "user", text: encryptText("detto al secondo gosino", MASTER) },
  ]);
  await db.insert(memories).values([
    { gosinoId: g, kind: "fact" as const, text: "Il corriere passa il martedì", importance: 0.8, embedding: embeddingFromSeed(1) },
    { gosinoId: g, kind: "insight" as const, text: encryptText("Le viti M3 tengono meglio", MASTER), importance: 0.9, embedding: embeddingFromSeed(2) },
    { gosinoId: g, kind: "fact" as const, text: "v1: la prima versione è andata online", importance: 0.5 },
  ]);
  await db.insert(diaryEntries).values({ gosinoId: g, date: "2026-11-20", text: encryptText("oggi ho dormito poco", MASTER) });
  await db.insert(desires).values({ gosinoId: g, text: "chiedere com'è andata la consegna" });
  await db.insert(events).values({ gosinoId: g, source: "face", type: "face_seen", payload: { n: 1 } });
  await db.insert(psycheSnapshots).values({ gosinoId: g, vars: { umore: 0.6 }, label: "sereno" });
  const [ivan] = await db.insert(beings).values({ accountId: a, displayName: "Ivan", embedding: embeddingFromSeed(3) }).returning({ id: beings.id });
  const [anna] = await db.insert(beings).values({ accountId: a, displayName: "Anna" }).returning({ id: beings.id });
  const ivanId = ivan?.id ?? "";
  await db.insert(bonds).values({ accountId: a, gosinoId: g, beingId: ivanId });
  await db.insert(relations).values({ accountId: a, beingA: ivanId, beingB: anna?.id ?? "", type: "cares_for" });
  const [memory] = await db.select({ id: memories.id }).from(memories).where(eq(memories.gosinoId, g)).limit(1);
  await db.insert(memoryBeings).values({ accountId: a, memoryId: memory?.id ?? "", beingId: ivanId });
  await db.insert(listItems).values({ accountId: a, list: "spesa", text: encryptText("il latte", MASTER) });
  await db.insert(games).values({ accountId: a, gosinoId: g, kind: "guess", secret: encryptText("42", MASTER) });
  await db.insert(rooms).values({ accountId: a, name: "Cucina", slug: "cucina" });
  await db.insert(photos).values({ accountId: a, gosinoId: g, objectKey: "photos/abc", expiresAt: new Date(Date.now() + 86_400_000) });
  const [meeting] = await db.insert(meetings).values({ gosinoId: g, platform: "meet", audioUri: "s3://audio/x" }).returning({ id: meetings.id });
  await db.insert(transcriptSegments).values({ accountId: a, meetingId: meeting?.id ?? "", speaker: "Ivan", t0: 0, t1: 3, text: encryptText("buongiorno a tutti", MASTER), embedding: embeddingFromSeed(4) });

  // ciò che NON deve uscire
  await db.insert(accessTokens).values({ accountId: a, tokenHash: "hash-segreto-123", role: "owner", label: "chiosco" });
  await db.insert(customers).values({ accountId: a, name: "Rossi SRL", slug: "rossi" });
  await db.insert(recognitionProfiles).values({ accountId: a, beingId: ivanId, modality: "face", model: "arcface", dimensions: 512, payload: Buffer.from("IMPRONTA-BIOMETRICA"), sampleCount: 3 });
  await db.insert(unknownPrints).values({ accountId: a, modality: "voice", model: "ecapa", dimensions: 192, payload: Buffer.from("ALTRA-IMPRONTA") });
  await db.insert(perceptionEvents).values({ gosinoId: g, modality: "face", confidence: 0.9, observed: {} });
  await db.insert(auditLog).values({ accountId: a, role: "owner", verb: "export", resourceType: "account", outcome: "ok" });

  // il vicino
  await db.insert(rooms).values({ accountId: houseB.accountId, name: "SalottoDelVicino", slug: "salotto-vicino" });
  await db.insert(messages).values({ gosinoId: houseB.gosinoId, channel: "home" as const, role: "user", text: encryptText("segreto del vicino", MASTER) });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("un archivio verificabile", () => {
  it("si apre con la frase, dichiara cosa è, e il suo record d'integrità regge", async () => {
    const { manifest, integrity, tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    expect(manifest.kind).toBe("ugo-soul");
    expect(manifest.mode).toBe("trasloco");
    expect(manifest.gosinoIds).toEqual([houseA.gosinoId]);
    expect(manifest.source.schemaVersion).toBe(latestMigrationTag());
    expect(integrity.files.map((f) => f.name)).toContain("tables/messages.ndjson");
    expect(integrity.files).toHaveLength(Object.keys(tables).length);
  });
});

describe("l'ordine delle tabelle (MKT-10.5)", () => {
  it("è quello delle chiavi esterne, perché l'importatore possa scorrere senza tenere una tabella in attesa", async () => {
    const { integrity } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const order = integrity.files.map((file) => file.name.replace(/^tables\//u, "").replace(/\.ndjson$/u, ""));
    const at = (table: string): number => order.indexOf(table);
    expect(at("accounts")).toBe(0); // la casa è la radice di tutto
    // ciò che è puntato viene prima di chi punta
    expect(at("gosini")).toBeLessThan(at("messages"));
    expect(at("gosini")).toBeLessThan(at("memories"));
    expect(at("beings")).toBeLessThan(at("bonds"));
    expect(at("beings")).toBeLessThan(at("relations"));
    expect(at("memories")).toBeLessThan(at("memory_beings"));
    expect(at("meetings")).toBeLessThan(at("transcript_segments"));
    expect(at("house_documents")).toBeLessThan(at("house_chunks"));
    expect(at("places")).toBeLessThan(at("rooms"));
    // e due esportazioni degli stessi dati le elencano nello stesso modo
    const again = (await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]))).integrity.files.map((f) => f.name);
    expect(again).toEqual(integrity.files.map((f) => f.name));
  });
});

describe("cosa esce, in chiaro", () => {
  it("messaggi scritti con tre chiavi diverse escono tutti leggibili", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const texts = (tables.messages ?? []).map((r) => r.text);
    expect(texts).toEqual(
      expect.arrayContaining(["scritto con la chiave master", "scritto con la chiave di casa", "scritto con la chiave sua"]),
    );
  });

  it("i ricordi: il chiaro resta chiaro (anche se comincia come un cifrato), il cifrato si apre", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const texts = (tables.memories ?? []).map((r) => r.text);
    expect(texts).toEqual(
      expect.arrayContaining(["Il corriere passa il martedì", "Le viti M3 tengono meglio", "v1: la prima versione è andata online"]),
    );
  });

  it("diario, spesa, segreto del gioco e trascrizioni escono leggibili; nessun cifrato nell'archivio", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const all = JSON.stringify(tables);
    for (const phrase of ["oggi ho dormito poco", "il latte", "buongiorno a tutti", '"secret":"42"']) {
      expect(all).toContain(phrase);
    }
    expect(all).not.toMatch(/"v1:[A-Za-z0-9+/]{38,}/u);
  });

  it("il branco, i legami e le stanze viaggiano", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    expect(tables.beings).toHaveLength(2);
    expect(tables.bonds).toHaveLength(1);
    expect(tables.relations).toHaveLength(1);
    expect(tables.memory_beings).toHaveLength(1);
    expect(tables.rooms).toHaveLength(1);
    expect(tables.trait_sets?.length).toBeGreaterThan(0); // il genoma
  });
});

describe("cosa NON esce", () => {
  it("nessuna chiave, nessun vettore, nessun token, nessuna impronta: nemmeno come testo", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const all = JSON.stringify(tables);
    for (const forbidden of [
      "hash-segreto-123",
      "IMPRONTA-BIOMETRICA",
      Buffer.from("IMPRONTA-BIOMETRICA").toString("hex"),
      "wrapped_data_key",
      "wrapped_soul_key",
      "signing_private_key",
      "rotation_secret",
      "is_foundry",
      "can_breed",
      '"embedding"',
      "search_vector",
      MASTER.toString("base64"),
      MASTER.toString("hex"),
      SOUL_KEY.toString("base64"),
      houseKey.toString("hex"),
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
  });

  it("le tabelle lasciate indietro non compaiono nell'archivio", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    for (const table of ["access_tokens", "customers", "recognition_profiles", "unknown_prints", "perception_events", "audit_log", "budget_ledger"]) {
      expect(tables, table).not.toHaveProperty(table);
    }
  });

  it("e il manifesto lo dice: ogni esclusione con categoria, motivo e numero esatto", async () => {
    const { manifest } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const find = (table: string, column?: string) =>
      manifest.omissions.find((o) => o.table === table && o.column === column);
    // Counted independently of the exporter. Founding a house mints an owner
    // token and writes audit rows of its own, so "1" was never the right number.
    const a = houseA.accountId;
    const real = {
      tokens: (await db.select().from(accessTokens).where(eq(accessTokens.accountId, a))).length,
      customers: (await db.select().from(customers).where(eq(customers.accountId, a))).length,
      profiles: (await db.select().from(recognitionProfiles).where(eq(recognitionProfiles.accountId, a))).length,
      prints: (await db.select().from(unknownPrints).where(eq(unknownPrints.accountId, a))).length,
      sightings: (await db.select().from(perceptionEvents).where(eq(perceptionEvents.gosinoId, houseA.gosinoId))).length,
      audit: (await db.select().from(auditLog).where(eq(auditLog.accountId, a))).length,
    };
    expect(real.tokens).toBeGreaterThanOrEqual(2); // the one seeded here plus the founder's
    expect(find("access_tokens")).toMatchObject({ category: "credentials", count: real.tokens });
    expect(find("customers")).toMatchObject({ category: "business-data", count: real.customers });
    expect(find("recognition_profiles")).toMatchObject({ category: "biometrics", count: real.profiles });
    expect(find("unknown_prints")).toMatchObject({ category: "biometrics", count: real.prints });
    expect(find("perception_events")).toMatchObject({ category: "biometrics", count: real.sightings });
    expect(find("audit_log")).toMatchObject({ category: "security-log", count: real.audit });
    expect(find("memories", "embedding")).toMatchObject({ category: "recomputable", count: 2 });
    expect(find("transcript_segments", "embedding")).toMatchObject({ category: "recomputable", count: 1 });
    expect(find("gosini", "wrapped_soul_key")).toMatchObject({ category: "data-keys", count: 1 });
    expect(find("accounts", "wrapped_data_key")).toMatchObject({ category: "data-keys", count: 1 });
    expect(find("photos", "object_key")).toMatchObject({ category: "media-bytes", count: 1 });
    expect(find("meetings", "audio_uri")).toMatchObject({ category: "media-bytes", count: 1 });
    expect(manifest.omissions.every((o) => o.reason.length > 20)).toBe(true);
  });
});

describe("il confine", () => {
  it("la casa vicina non compare, in nessuna forma", async () => {
    const { tables } = await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]));
    const all = JSON.stringify(tables);
    expect(all).not.toContain("SalottoDelVicino");
    expect(all).not.toContain("segreto del vicino");
    expect(all).not.toContain(houseB.accountId);
  });

  it("esce solo la creatura scelta; scegliendole entrambe esce anche l'altra", async () => {
    const one = JSON.stringify((await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId]))).tables);
    expect(one).not.toContain("detto al secondo gosino");
    expect(one).not.toContain(second);
    const both = JSON.stringify((await readArchive(await exportBytes(houseA.accountId, [houseA.gosinoId, second]))).tables);
    expect(both).toContain("detto al secondo gosino");
  });
});

describe("rifiuti, prima di scrivere un byte", () => {
  async function refusal(accountId: string, ids: string[]): Promise<{ code: string; written: number }> {
    let written = 0;
    try {
      await exportSoulArchive(db, deps, { accountId, gosinoIds: ids, mode: "trasloco", secret: SECRET }, (c) => {
        written += c.length;
        return Promise.resolve();
      });
    } catch (error) {
      if (error instanceof ExportRefusal) return { code: error.code, written };
      throw error;
    }
    return { code: "none", written };
  }

  it("nessuna creatura scelta", async () => {
    expect(await refusal(houseA.accountId, [])).toEqual({ code: "no-creatures", written: 0 });
  });

  it("una creatura di un'altra casa", async () => {
    expect(await refusal(houseA.accountId, [houseB.gosinoId])).toEqual({ code: "unknown-creature", written: 0 });
  });

  it("una creatura congedata non si trasloca", async () => {
    const [temp] = await db.insert(gosini).values({ accountId: houseA.accountId, name: "Andato", retiredAt: new Date() }).returning({ id: gosini.id });
    expect(await refusal(houseA.accountId, [temp?.id ?? ""])).toEqual({ code: "retired-creature", written: 0 });
  });
});

describe("la rete di sicurezza: nel dubbio si ferma", () => {
  let house: { accountId: string; gosinoId: string };
  beforeAll(async () => {
    house = await createAccountWithFounder(db, MASTER, { slug: "casa-guasta", name: "Guasta", gosinoName: "Guasto" });
  });

  async function failure(): Promise<{ error: unknown; partial: Buffer }> {
    const chunks: Buffer[] = [];
    try {
      await exportSoulArchive(db, deps, { accountId: house.accountId, gosinoIds: [house.gosinoId], mode: "trasloco", secret: SECRET }, (c) => {
        chunks.push(c);
        return Promise.resolve();
      });
    } catch (error) {
      return { error, partial: Buffer.concat(chunks) };
    }
    throw new Error("doveva fallire");
  }

  it("un messaggio che nessuna chiave apre ferma l'export, e il file a metà non si apre mai", async () => {
    await db.insert(messages).values({
      gosinoId: house.gosinoId, channel: "home" as const, role: "user",
      text: encryptText("di un'altra installazione", randomBytes(32)),
    });
    const { error, partial } = await failure();
    expect(error).toBeInstanceOf(UndecryptableError);
    expect((error as Error).message).not.toContain("altra installazione");
    // il lettore non lo scambia per un archivio valido: manca la fine
    await expect(readArchive(partial)).rejects.toBeInstanceOf(ArchiveError);
    await db.delete(messages).where(eq(messages.gosinoId, house.gosinoId));
  });

  it("un cifrato dentro una colonna dichiarata in chiaro ferma l'export", async () => {
    await db.insert(events).values({
      gosinoId: house.gosinoId, source: "system" as const, type: "nota",
      payload: { dentro: encryptText("nascosto", MASTER) },
    });
    const { error } = await failure();
    expect(error).toBeInstanceOf(StrayCiphertextError);
    await db.delete(events).where(eq(events.gosinoId, house.gosinoId));
  });
});

describe("tabelle grandi", () => {
  it("più batch del cursore: ogni riga esce una volta sola, e l'integrità regge", async () => {
    const g = houseA.gosinoId;
    await db.insert(events).values(
      Array.from({ length: 1_300 }, (_, i) => ({ gosinoId: g, source: "system" as const, type: `t${String(i)}`, payload: { i } })),
    );
    const { tables, integrity } = await readArchive(await exportBytes(houseA.accountId, [g]));
    const mine = (tables.events ?? []).filter((e) => String(e.type).startsWith("t"));
    expect(mine).toHaveLength(1_300);
    expect(new Set(mine.map((e) => e.type)).size).toBe(1_300);
    const file = integrity.files.find((f) => f.name === "tables/events.ndjson");
    expect(file?.rows).toBe((tables.events ?? []).length);
  });
});

describe("la policy contro il database vero", () => {
  it("conosce ogni tabella, ogni colonna opaca, e non cita colonne che non esistono più", async () => {
    const { TABLES } = await import("../../src/services/soulExport/policyTables.js");
    const columns = (await db.$client`
      select table_name t, column_name c, udt_name u from information_schema.columns where table_schema = 'public'`) as unknown as { t: string; c: string; u: string }[];
    const byTable = new Map<string, Map<string, string>>();
    for (const { t, c, u } of columns) byTable.set(t, (byTable.get(t) ?? new Map<string, string>()).set(c, u));

    expect([...byTable.keys()].filter((t) => !(t in TABLES))).toEqual([]);
    for (const [table, policy] of Object.entries(TABLES)) {
      const cols = byTable.get(table);
      expect(cols, `${table} non esiste più`).toBeDefined();
      if (cols === undefined || policy.omit !== undefined) continue;
      const declared = new Set([...Object.keys(policy.drop ?? {}), ...(policy.publicBytes ?? [])]);
      for (const [column, type] of cols) {
        if (["bytea", "vector", "tsvector"].includes(type)) {
          expect(declared.has(column), `${table}.${column} (${type}) non è classificata`).toBe(true);
        }
      }
      for (const column of [...Object.keys(policy.drop ?? {}), ...(policy.encrypted ?? []), ...(policy.publicBytes ?? [])]) {
        expect(cols.has(column), `${table}.${column} è nella policy ma non nel database`).toBe(true);
      }
      if (policy.mediaColumn !== undefined) expect(cols.has(policy.mediaColumn)).toBe(true);
    }
  });
});
