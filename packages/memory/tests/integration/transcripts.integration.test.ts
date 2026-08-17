import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  gosini,
  households,
  meetings,
  PRIME_HOUSEHOLD_ID,
  runMigrations,
  transcriptSegments,
  type DbClient,
} from "@ugo/db";
import { EMBED_MODEL, startOllama, type OllamaHandle } from "@ugo/factories";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OllamaEmbeddingsClient } from "../../src/embeddings.js";
import { searchTranscripts } from "../../src/transcripts.js";

/**
 * Il confine fra due case, provato sul database vero (Zero-Mock: Postgres con
 * pgvector e gli embedding veri di nomic-embed-text).
 *
 * `searchTranscripts` girava senza scope: la `where` era solo
 * `embedding is not null`, e chi chiamava decifrava il risultato con la
 * propria chiave. Una registrazione è la cosa più privata che questo sistema
 * conservi, e il confine che attraversava era l'unico che ADR-019 esista per
 * disegnare. Questo test esiste perché non lo riattraversi mai più.
 */

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;

const OTHER_HOUSEHOLD = "00000000-0000-4000-8000-0000000000ff";

/** Una casa con un esemplare, una riunione e un segmento trascritto. */
async function houseWithRecording(
  householdId: string,
  slug: string,
  text: string,
): Promise<void> {
  await db.insert(households).values({ id: householdId, slug, name: slug }).onConflictDoNothing();
  const [creature] = await db
    .insert(gosini)
    .values({ householdId, name: `ugo-${slug}` })
    .returning({ id: gosini.id });
  const [meeting] = await db
    .insert(meetings)
    .values({ gosinoId: creature?.id ?? "", platform: "meet", title: slug })
    .returning({ id: meetings.id });
  const [embedding] = await embedder.embed([text]);
  await db.insert(transcriptSegments).values({
    meetingId: meeting?.id ?? "",
    householdId,
    t0: 0,
    t1: 3,
    // il testo a riposo è ciphertext in produzione; qui conta solo che la riga
    // esista e sia raggiungibile per embedding, non che sia leggibile
    text: `ciphertext:${text}`,
    ...(embedding !== undefined && { embedding: [...embedding] }),
  });
}

beforeAll(async () => {
  [pg, ollama] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);

  // due case che hanno registrato la STESSA cosa: senza scope la ricerca di
  // una pescava il segmento dell'altra, ed erano indistinguibili
  await houseWithRecording(
    PRIME_HOUSEHOLD_ID,
    "casa-prime",
    "Ivan ha detto che il preventivo del tetto sale a dodicimila euro.",
  );
  await houseWithRecording(
    OTHER_HOUSEHOLD,
    "casa-vicina",
    "Ivan ha detto che il preventivo del tetto sale a dodicimila euro.",
  );
}, 300_000);

afterAll(async () => {
  await db.$client.end();
  await Promise.all([pg.stop(), ollama.container.stop()]);
});

describe("searchTranscripts si ferma al tetto della casa", () => {
  it("trova la registrazione della propria casa", async () => {
    const found = await searchTranscripts(
      db,
      embedder,
      "cosa aveva detto Ivan sul preventivo?",
      5,
      PRIME_HOUSEHOLD_ID,
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((row) => row.text.includes("preventivo"))).toBe(true);
  });

  it("non restituisce NULLA della casa vicina", async () => {
    // la domanda è la stessa, il corpus dell'altra casa è identico: se lo
    // scope non filtrasse, questa ricerca troverebbe due righe invece di una
    const mine = await searchTranscripts(
      db,
      embedder,
      "cosa aveva detto Ivan sul preventivo?",
      10,
      PRIME_HOUSEHOLD_ID,
    );
    const ids = new Set(mine.map((row) => row.id));

    const theirs = await searchTranscripts(
      db,
      embedder,
      "cosa aveva detto Ivan sul preventivo?",
      10,
      OTHER_HOUSEHOLD,
    );

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    // nessun segmento compare in entrambe le risposte
    expect(theirs.some((row) => ids.has(row.id))).toBe(false);
  });

  it("una casa senza registrazioni non vede quelle altrui", async () => {
    const empty = await searchTranscripts(
      db,
      embedder,
      "cosa aveva detto Ivan sul preventivo?",
      10,
      "00000000-0000-4000-8000-0000000000ee",
    );
    expect(empty).toHaveLength(0);
  });
});
