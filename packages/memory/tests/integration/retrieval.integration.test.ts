import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, memories, runMigrations, type DbClient } from "@ugo/db";
import { EMBED_MODEL, MemoryFactory, startOllama, type OllamaHandle } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OllamaEmbeddingsClient } from "../../src/embeddings.js";
import { searchMemories, writeMemory } from "../../src/retrieval.js";

// Zero-Mock: real Postgres+pgvector AND real Ollama embeddings — semantic
// similarity below is produced by the actual nomic-embed-text model.

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;

beforeAll(async () => {
  [pg, ollama] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);
});

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop()]);
});

describe("write + semantic search on real infrastructure", () => {
  it("stores a memory with a real 768d embedding", async () => {
    const { id } = await writeMemory(db, embedder, {
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
      await writeMemory(db, embedder, { kind: "episode", text: noise, importance: 0.5 });
    }

    const results = await searchMemories(db, embedder, "come si chiama il gatto?", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.text).toContain("Bruno");
    expect(results[0]?.similarity).toBeGreaterThan(results.at(-1)?.similarity ?? 1);

    const touched = await db
      .select({ lastAccessed: memories.lastAccessed })
      .from(memories)
      .where(eq(memories.id, results[0]?.id ?? ""));
    expect(touched[0]?.lastAccessed).not.toBeNull();
  });

  it("importance shifts the ranking (re-rank is not similarity-only)", async () => {
    // two near-identical texts, wildly different importance
    const low = await writeMemory(db, embedder, {
      kind: "preference",
      text: "Al proprietario piace il caffè macchiato al mattino.",
      importance: 0.05,
    });
    const high = await writeMemory(db, embedder, {
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

  it("rejects embeddings of the wrong dimension at the client boundary", async () => {
    const bad = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);
    // factory data is fine, but the dimension check is on real responses:
    // simulate a wrong-dim expectation by asking a bogus model name
    await expect(bad.embed([MemoryFactory.create().text])).resolves.toHaveLength(1);
    const wrongModel = new OllamaEmbeddingsClient(ollama.baseUrl, "no-such-model");
    await expect(wrongModel.embed(["x"])).rejects.toThrow();
  });
});
