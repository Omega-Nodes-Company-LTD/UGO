import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  memories,
  PRIME_GOSINO_ID,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { MemoryFactory, openRouterKey, REFUSED_MODEL } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_EMBED_MODEL, OpenRouterEmbeddingsClient } from "../../src/openRouterEmbeddings.js";
import { searchMemories, writeMemory } from "../../src/retrieval.js";

// Zero-Mock: real Postgres+pgvector AND real OpenRouter embeddings (ADR-131) —
// semantic similarity below is produced by the actual embedding model.

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let embedder: OpenRouterEmbeddingsClient;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OpenRouterEmbeddingsClient({ db, apiKey: openRouterKey() });
});

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("write + semantic search on real infrastructure", () => {
  it("stores a memory with a real 768d embedding", async () => {
    const { id } = await writeMemory(db, embedder, {
      gosinoId: PRIME_GOSINO_ID,
      kind: "fact",
      text: "Il gatto di casa si chiama Bruno e dorme sul router.",
      importance: 0.8,
    });
    const rows = await db.select().from(memories).where(eq(memories.id, id));
    expect(rows[0]?.embedding).toHaveLength(768);
  });

  it("retrieves the semantically relevant memory first and touches last_accessed", async () => {
    for (const noise of [
      "La lavatrice fa un rumore strano durante la centrifuga.",
      "Domani è prevista pioggia su Parma.",
      "La riunione con il fornitore è stata spostata a giovedì.",
    ]) {
      await writeMemory(db, embedder, {
        gosinoId: PRIME_GOSINO_ID,
        kind: "episode",
        text: noise,
        importance: 0.5,
      });
    }

    const results = await searchMemories(db, embedder, "come si chiama il gatto?", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.text).toContain("Bruno");
    // the cat outscores every other memory that made it through: with ADR-131's
    // embedder the unrelated ones mostly fall under MIN_SIMILARITY and never
    // come back at all, which is the stronger form of the same claim
    const best = results[0]?.similarity ?? 0;
    for (const other of results.slice(1)) expect(other.similarity).toBeLessThan(best);
    expect(results.some((result) => result.text.includes("lavatrice"))).toBe(false);

    const touched = await db
      .select({ lastAccessed: memories.lastAccessed })
      .from(memories)
      .where(eq(memories.id, results[0]?.id ?? ""));
    expect(touched[0]?.lastAccessed).not.toBeNull();
  });

  it("importance shifts the ranking (re-rank is not similarity-only)", async () => {
    // two near-identical texts, wildly different importance
    const low = await writeMemory(db, embedder, {
      gosinoId: PRIME_GOSINO_ID,
      kind: "preference",
      text: "Al proprietario piace il caffè macchiato al mattino.",
      importance: 0.05,
    });
    const high = await writeMemory(db, embedder, {
      gosinoId: PRIME_GOSINO_ID,
      kind: "preference",
      text: "Al proprietario piace il caffè macchiato la mattina.",
      importance: 0.95,
    });
    const results = await searchMemories(db, embedder, "che caffè preferisce?", 2);
    const ids = results.map((r) => r.id);
    // the two texts are near-identical, so similarity cannot separate them:
    // only importance can, and it puts the 0.95 one first
    expect(ids[0]).toBe(high.id);
    expect(ids.indexOf(high.id)).toBeLessThan(
      ids.includes(low.id) ? ids.indexOf(low.id) : Number.MAX_SAFE_INTEGER,
    );
    // This used to also assert that importance pushed the low one out of the
    // top-2 entirely. It no longer does, and not because importance stopped
    // mattering: the ADR-022 threshold now drops the unrelated memories this
    // test used to compete against, so there is room in the top-2 for both.

  });

  it("returns one 768d vector per input, in input order", async () => {
    const texts = [
      MemoryFactory.create({ gosinoId: PRIME_GOSINO_ID }).text,
      "Il gatto di casa si chiama Bruno.",
    ];
    const vectors = await embedder.embed(texts);
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) expect(vector).toHaveLength(768);
    // order is the input's: the second vector is the cat, not the factory text
    const [cat] = await embedder.embed([texts[1] ?? ""]);
    const cosine = (a: number[], b: number[]): number =>
      a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0) /
      (Math.hypot(...a) * Math.hypot(...b));
    expect(cosine(vectors[1] ?? [], cat ?? [])).toBeGreaterThan(0.99);
  });

  /**
   * ADR-131: ogni embedding è una chiamata pagata, quindi scrive la sua riga
   * sul registro (regola 3) — col modello degli embedding, non con quello
   * della chat, e col costo che dichiara chi incassa.
   */
  it("writes a budget_ledger row per call, under the embedding model", async () => {
    const before = await db.select().from(budgetLedger).where(eq(budgetLedger.model, DEFAULT_EMBED_MODEL));
    await embedder.embed(["una riga sul registro"]);
    const after = await db.select().from(budgetLedger).where(eq(budgetLedger.model, DEFAULT_EMBED_MODEL));
    expect(after).toHaveLength(before.length + 1);
    const row = after.find((candidate) => !before.some((old) => old.id === candidate.id));
    expect(row?.provider).toBe("openrouter");
    expect(row?.tokensIn).toBeGreaterThan(0);
    expect(Number(row?.costUsd)).toBeGreaterThanOrEqual(0);
  });

  it("an empty batch costs nothing: no call, no row", async () => {
    const before = (await db.select().from(budgetLedger)).length;
    await expect(embedder.embed([])).resolves.toEqual([]);
    expect((await db.select().from(budgetLedger)).length).toBe(before);
  });

  it("a model the provider refuses throws, and nothing is booked", async () => {
    const before = (await db.select().from(budgetLedger)).length;
    const refused = new OpenRouterEmbeddingsClient({ db, apiKey: openRouterKey(), model: REFUSED_MODEL });
    await expect(refused.embed(["x"])).rejects.toThrow(/embeddings request failed/);
    expect((await db.select().from(budgetLedger)).length).toBe(before);
  });
});
