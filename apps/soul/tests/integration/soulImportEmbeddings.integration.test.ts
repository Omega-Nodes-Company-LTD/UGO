import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, type DbClient, memories, runMigrations, transcriptSegments, meetings } from "@ugo/db";
import { openRouterKey, startPostgres } from "@ugo/factories";
import { OpenRouterEmbeddingsClient } from "@ugo/memory";
import { EMBEDDING_DIMENSIONS, encryptText } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { exportSoulArchive } from "../../src/services/soulExport/exportSoul.js";
import { importSoulArchive } from "../../src/services/soulImport/importSoul.js";

/**
 * I vettori si ricalcolano sul fornitore VERO (ADR-125/131: niente stub, e
 * niente test che salta quando manca la chiave — sembrerebbe verde senza
 * girare mai). Sta in un file suo perché `soulImport.integration.test.ts` non
 * ha bisogno di rete e deve poter girare ovunque.
 *
 * Ciò che si prova: l'archivio non porta vettori, e dopo l'import la casa nuova
 * ha la ricerca semantica funzionante, pagata sul REGISTRO DELLA CASA NUOVA —
 * che prima del commit esiste solo dentro la transazione dell'import.
 */

const MASTER_A = randomBytes(32);
const MASTER_B = randomBytes(32);
const SECRET = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01";
const MODEL = "openai/text-embedding-3-small";

const stops: (() => Promise<void>)[] = [];
let source: DbClient;
let target: DbClient;
let houseId: string;
let creatureId: string;
let report: Awaited<ReturnType<typeof importSoulArchive>>;
let apiKey: string;

async function fresh(): Promise<DbClient> {
  const started = await startPostgres();
  const container: StartedPostgreSqlContainer = started.container;
  await runMigrations(started.url);
  const db = createDbClient(started.url);
  stops.push(async () => {
    await db.$client.end();
    await container.stop();
  });
  return db;
}

beforeAll(async () => {
  apiKey = openRouterKey();
  source = await fresh();
  target = await fresh();
  const house = await createAccountWithFounder(source, MASTER_A, { slug: "casa-vettori", name: "Vettori", gosinoName: "Ugo" });
  houseId = house.accountId;
  creatureId = house.gosinoId;
  await source.insert(memories).values([
    { gosinoId: creatureId, kind: "fact" as const, text: "Il corriere DHL passa il martedì mattina", importance: 0.8 },
    { gosinoId: creatureId, kind: "fact" as const, text: "La caldaia va spurgata ogni autunno", importance: 0.7 },
    { gosinoId: creatureId, kind: "preference" as const, text: "A Monika piace il tè verde", importance: 0.5 },
  ]);
  const [meeting] = await source.insert(meetings).values({ gosinoId: creatureId, platform: "meet" }).returning({ id: meetings.id });
  await source.insert(transcriptSegments).values({ accountId: houseId, meetingId: meeting?.id ?? "", speaker: "Ivan", t0: 0, t1: 4, text: encryptText("domani porto i pacchi alle nove", MASTER_A) });

  const chunks: Buffer[] = [];
  await exportSoulArchive(source, { masterKey: MASTER_A, generatorVersion: "test", embeddingModel: MODEL, embeddingDimensions: EMBEDDING_DIMENSIONS, kdf: { log2N: 10, r: 8, p: 1 } }, { accountId: houseId, gosinoIds: [creatureId], mode: "trasloco", secret: SECRET }, (c) => {
    chunks.push(c);
    return Promise.resolve();
  });
  const archive = Buffer.concat(chunks);
  report = await importSoulArchive(
    target,
    {
      masterKey: MASTER_B,
      embeddingModel: MODEL,
      embedderFor: (tx, accountId, gosinoId) => new OpenRouterEmbeddingsClient({ db: tx, apiKey, accountId, gosinoId, model: MODEL }),
    },
    (async function* () {
      await Promise.resolve();
      yield archive;
    })(),
    SECRET,
  );
}, 300_000);

afterAll(async () => {
  await Promise.all(stops.map((stop) => stop()));
});

describe("i vettori della casa nuova", () => {
  it("si ricalcolano: ogni ricordo e ogni trascrizione ne ha uno, a 768 dimensioni", async () => {
    expect(report.embeddings).toEqual({ computed: 4, pending: 0 });
    const rows = (await target.execute(sql`
      select (select count(*)::int from memories where embedding is not null) as m,
             (select count(*)::int from transcript_segments where embedding is not null) as s,
             (select vector_dims(embedding) from memories where embedding is not null limit 1) as d`)) as unknown as { m: number; s: number; d: number }[];
    expect(rows[0]).toEqual({ m: 3, s: 1, d: EMBEDDING_DIMENSIONS });
  });

  it("e la ricerca semantica funziona: la domanda trova il ricordo giusto", async () => {
    const [vector] = await new OpenRouterEmbeddingsClient({ db: target, apiKey, accountId: houseId, gosinoId: creatureId, model: MODEL }).embed(["quando passa il corriere?"]);
    const literal = `[${(vector ?? []).join(",")}]`;
    const nearest = (await target.execute(sql`select text from memories where embedding is not null order by embedding <=> ${literal}::vector limit 1`)) as unknown as { text: string }[];
    expect(nearest[0]?.text).toContain("corriere");
  });

  it("la spesa è sul registro della casa NUOVA, e solo lì", async () => {
    const rows = await target.select().from(budgetLedger).where(eq(budgetLedger.accountId, houseId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((row) => row.model === MODEL)).toBe(true);
    expect(await target.select().from(budgetLedger)).toHaveLength(rows.length);
  });
});
