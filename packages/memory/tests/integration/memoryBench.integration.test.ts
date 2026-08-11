import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, memories, runMigrations, type DbClient } from "@ugo/db";
import { EMBED_MODEL, startOllama, type OllamaHandle } from "@ugo/factories";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OllamaEmbeddingsClient } from "../../src/embeddings.js";
import { benchReport, type BenchCase, type BenchReport } from "../../src/metrics.js";
import { searchMemories } from "../../src/retrieval.js";

/**
 * Banco di prova della memoria (backlog, gruppo 1).
 *
 * Zero-Mock: real Postgres+pgvector and real Ollama embeddings — the numbers
 * below come from the actual nomic-embed-text model ranking actual Italian.
 *
 * It measures `searchMemories` and does not touch it. In particular the bench
 * applies no threshold of its own: retrieval today always returns k rows, so
 * the abstention rate it reports is 0, and that is the honest reading of a
 * system that has no way to say "non lo so". Raising it is the job of the
 * hybrid search, not of the ruler that measures it.
 */

const MEMORY_KIND = z.enum(["fact", "preference", "episode", "insight"]);

const corpusSchema = z.object({
  note: z.string(),
  memories: z
    .array(
      z.object({
        key: z.string().min(1),
        kind: MEMORY_KIND,
        text: z.string().min(1),
        importance: z.number().min(0).max(1),
        createdDaysAgo: z.number().int().min(0),
        validFromDaysAgo: z.number().int().min(0),
        invalidatedDaysAgo: z.number().int().min(0).nullable(),
      }),
    )
    .min(1),
  questions: z
    .array(
      z.object({
        query: z.string().min(1),
        family: z.enum(["temporale", "contraddizione", "semantica", "lessicale", "astensione"]),
        relevant: z.array(z.string()),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

type Corpus = z.infer<typeof corpusSchema>;
type Family = Corpus["questions"][number]["family"];

/** The bench asks for k memories, the same order of magnitude the chat uses. */
const K = 5;

/** Fixed clock: recency decays with τ=30d, so a moving "now" would drift the scores. */
const NOW = new Date("2026-08-11T12:00:00Z");
const MS_PER_DAY = 86_400_000;
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * MS_PER_DAY);

/**
 * Non-regression floors, one per family: measured, not wished for. They rise
 * and never fall, and each move records the backlog point that caused it.
 *
 * Baseline 2026-08-11 — semantic-only retrieval. See ./bench/BASELINE.md for
 * what these numbers mean and why three families sit at zero. In short:
 * `astensione` is 0 because `searchMemories` has no threshold and cannot
 * return nothing; `semantica` and `lessicale` are 0 because the recency factor
 * dominates the product and buries any memory older than a few months,
 * however well it matches. A floor of 0 asserts nothing on purpose — it
 * records a fact rather than pretending to guard one.
 */
const FLOORS: Record<Family, { recallAtK: number; mrr: number }> = {
  temporale: { recallAtK: 1, mrr: 0.5 },
  contraddizione: { recallAtK: 1, mrr: 1 },
  semantica: { recallAtK: 0, mrr: 0 },
  lessicale: { recallAtK: 0, mrr: 0 },
  astensione: { recallAtK: 0, mrr: 0 },
};

const corpusPath = fileURLToPath(new URL("./bench/corpus.it.json", import.meta.url));
const corpus: Corpus = corpusSchema.parse(JSON.parse(readFileSync(corpusPath, "utf8")));

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;
/** corpus key → the uuid it was seeded under */
const idByKey = new Map<string, string>();
const keyById = new Map<string, string>();

beforeAll(async () => {
  [pg, ollama] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);

  // one embed call for the whole corpus: every memory is a real network round
  // trip and the CI integration job has 30 minutes for every suite together
  const embeddings = await embedder.embed(corpus.memories.map((one) => one.text));

  const rows = corpus.memories.map((one, index) => ({
    kind: one.kind,
    text: one.text,
    embedding: embeddings[index],
    importance: one.importance,
    createdAt: daysAgo(one.createdDaysAgo),
    validFrom: daysAgo(one.validFromDaysAgo),
    invalidatedAt: one.invalidatedDaysAgo === null ? null : daysAgo(one.invalidatedDaysAgo),
    invalidatedReason: one.invalidatedDaysAgo === null ? null : "sostituito da un fatto più recente",
    sourceRefs: { bench: one.key },
  }));

  const inserted = await db
    .insert(memories)
    .values(rows)
    .returning({ id: memories.id, sourceRefs: memories.sourceRefs });

  for (const row of inserted) {
    const key = z.object({ bench: z.string() }).parse(row.sourceRefs).bench;
    idByKey.set(key, row.id);
    keyById.set(row.id, key);
  }
}, 300_000);

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop()]);
});

/**
 * Runs the whole suite once. `searchMemories` writes `last_accessed` on the
 * winners, which would make question n+1 see a recency question n created —
 * so the touch is undone between questions and the corpus stays as seeded.
 */
async function runSuite(): Promise<Map<Family, BenchCase[]>> {
  const byFamily = new Map<Family, BenchCase[]>();
  for (const question of corpus.questions) {
    const found = await searchMemories(db, embedder, question.query, K, NOW);
    await db.update(memories).set({ lastAccessed: null });

    const bucket = byFamily.get(question.family) ?? [];
    bucket.push({
      query: question.query,
      relevant: question.relevant.map((key) => idByKey.get(key) ?? key),
      retrieved: found.map((memory) => memory.id),
    });
    byFamily.set(question.family, bucket);
  }
  return byFamily;
}

describe("banco di prova della memoria", () => {
  it("the fixture only points at memories that exist", () => {
    const keys = new Set(corpus.memories.map((one) => one.key));
    const dangling = corpus.questions.flatMap((question) =>
      question.relevant.filter((key) => !keys.has(key)),
    );
    expect(dangling).toEqual([]);
  });

  it("seeded the whole corpus with real 768d embeddings", async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memories)
      .where(sql`${memories.embedding} is not null`);
    expect(row?.count).toBe(corpus.memories.length);
    expect(idByKey.size).toBe(corpus.memories.length);
  });

  it("scores every family at or above its floor, and prints the report", async () => {
    const byFamily = await runSuite();
    const report: Record<string, BenchReport> = {};

    for (const [family, cases] of byFamily) {
      report[family] = benchReport(cases, K);
    }
    // the reproducible evidence the Definition of Done asks for
    console.log(`banco di prova @k=${String(K)}\n${JSON.stringify(report, null, 2)}`);

    for (const [family, floor] of Object.entries(FLOORS) as [
      Family,
      { recallAtK: number; mrr: number },
    ][]) {
      const scored = report[family];
      expect(scored, `family ${family} produced no cases`).toBeDefined();
      if (scored === undefined) continue;
      expect(scored.recallAtK, `${family}: recall@${String(K)} fell below its floor`).toBeGreaterThanOrEqual(
        floor.recallAtK,
      );
      expect(scored.mrr, `${family}: MRR fell below its floor`).toBeGreaterThanOrEqual(floor.mrr);
    }
  });

  it("never returns a memory that was invalidated, however close it looks", async () => {
    const retired = idByKey.get("ivan-lavoro-vecchio");
    const found = await searchMemories(db, embedder, "dove lavora Ivan?", K, NOW);
    await db.update(memories).set({ lastAccessed: null });
    expect(found.map((memory) => memory.id)).not.toContain(retired);
  });

  it("buries an old memory under recent noise, however well it matches", async () => {
    // The finding this bench was built to surface. "Il gatto di casa si chiama
    // Bruno" has the highest cosine similarity in the corpus for this question
    // (0.676 measured, against 0.608 for the best of the rest) and does not
    // come back at all: at 120 days its recency factor is e^-4 ≈ 0.018, while
    // a five-day-old irrelevant memory sits at 0.85. Similarity and importance
    // are both bounded by 1, so no amount of either can recover a 46× penalty.
    //
    // When the ranking is fixed this test will fail. That is the point of it.
    const cat = idByKey.get("gatto-bruno");
    expect(cat).toBeDefined();
    const found = await searchMemories(db, embedder, "come si chiama il gatto?", K, NOW);
    await db.update(memories).set({ lastAccessed: null });
    expect(found.map((memory) => memory.id)).not.toContain(cat);
  });

  it("has no way to abstain yet: an unanswerable question still gets answers", async () => {
    // Not a wish, a measurement: retrieval has no threshold, so it always
    // returns k rows. This test is what "ricerca ibrida" has to overturn.
    const found = await searchMemories(db, embedder, "qual e il codice IBAN del conto?", K, NOW);
    await db.update(memories).set({ lastAccessed: null });
    expect(found.length).toBeGreaterThan(0);
  });
});
