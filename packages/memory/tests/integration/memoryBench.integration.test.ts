import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, memories, PRIME_GOSINO_ID, runMigrations, type DbClient } from "@ugo/db";
import { EMBED_MODEL, startOllama, TEXT_MODEL, type OllamaHandle } from "@ugo/factories";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OllamaEmbeddingsClient } from "../../src/embeddings.js";
import { benchReport, type BenchCase, type BenchReport } from "../../src/metrics.js";
import { searchMemories } from "../../src/retrieval.js";
import { canAnswer } from "../../src/abstain.js";
import { OllamaTextClient } from "../../src/localText.js";

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
 * Raised twice on 2026-08-11: by ADR-021 (τ per kind) and then by ADR-022
 * (hybrid search). See ./bench/BASELINE.md for all three measurements on the
 * same corpus and the same command.
 *
 * `astensione` stays at 0, and this time not for lack of a mechanism: the
 * similarity bands of answerable and unanswerable questions overlap on this
 * corpus, so no absolute threshold separates them. A floor of 0 asserts nothing
 * on purpose — it records a fact rather than pretending to guard one.
 */
const FLOORS: Record<Family, { recallAtK: number; mrr: number }> = {
  temporale: { recallAtK: 1, mrr: 1 },
  contraddizione: { recallAtK: 1, mrr: 1 },
  semantica: { recallAtK: 1, mrr: 0.64 },
  lessicale: { recallAtK: 1, mrr: 0.8 },
  astensione: { recallAtK: 0, mrr: 0 },
};

const corpusPath = fileURLToPath(new URL("./bench/corpus.it.json", import.meta.url));
const corpus: Corpus = corpusSchema.parse(JSON.parse(readFileSync(corpusPath, "utf8")));

let pg: StartedPostgreSqlContainer;
let ollama: OllamaHandle;
let db: DbClient;
let embedder: OllamaEmbeddingsClient;
let judge: OllamaTextClient;
/** corpus key → the uuid it was seeded under */
const idByKey = new Map<string, string>();
const keyById = new Map<string, string>();

beforeAll(async () => {
  [pg, ollama] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    startOllama({ models: [EMBED_MODEL, TEXT_MODEL] }),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  embedder = new OllamaEmbeddingsClient(ollama.baseUrl, EMBED_MODEL);
  // ADR-107: il giudice dell'astensione. Modello di casa, mai il provider
  // (regola 3), e piccolo perché deve rispondere una parola sola.
  judge = new OllamaTextClient(ollama.baseUrl, TEXT_MODEL);

  // one embed call for the whole corpus: every memory is a real network round
  // trip and the CI integration job has 30 minutes for every suite together
  const embeddings = await embedder.embed(corpus.memories.map((one) => one.text));

  const rows = corpus.memories.map((one, index) => ({
    gosinoId: PRIME_GOSINO_ID,
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

  it("recalls a stable fact nobody has asked about in months (ADR-021)", async () => {
    // The finding this bench was built to surface, now the other way round.
    // "Il gatto di casa si chiama Bruno" is 120 days old and has the highest
    // cosine similarity in the corpus for this question (0.676 measured,
    // against 0.608 for the best of the rest). Under a global τ=30d it did not
    // come back at all — a 46× age penalty against two factors bounded by 1.
    // A fact now decays over 730 days, so relevance decides again.
    const cat = idByKey.get("gatto-bruno");
    expect(cat).toBeDefined();
    const found = await searchMemories(db, embedder, "come si chiama il gatto?", K, NOW);
    await db.update(memories).set({ lastAccessed: null });
    expect(found[0]?.id).toBe(cat);
  });

  it("still lets an episode fade, which is what the decay is for", async () => {
    // ADR-021 lengthens τ for facts, not for everything: within a kind, what
    // happened last month still loses to what happened last week. Asked for the
    // whole living corpus, because facts outrank episodes in any mixed ranking.
    const stale = idByKey.get("libreria-montaggio"); // episode, 100 days
    const fresh = idByKey.get("lavatrice-rumore"); // episode, 12 days
    const everything = corpus.memories.length;
    const found = await searchMemories(db, embedder, "cosa si è rotto in casa?", everything, NOW);
    await db.update(memories).set({ lastAccessed: null });
    const ids = found.map((memory) => memory.id);
    expect(ids).toContain(fresh);
    expect(ids.indexOf(fresh ?? "")).toBeLessThan(
      ids.includes(stale ?? "") ? ids.indexOf(stale ?? "") : Number.MAX_SAFE_INTEGER,
    );
  });

  /**
   * Il tavolo delle prove per l'astensione (gruppo 1 del backlog).
   *
   * ADR-022 ha misurato che **nessuna soglia assoluta sul coseno** separa le
   * domande con risposta da quelle senza: le due bande si sovrappongono. La
   * conclusione era che serve un criterio **relativo**, e la conclusione è
   * rimasta lì — perché scegliere quale criterio senza vedere i numeri
   * significa tararlo sul corpus, cioè aver visto le risposte.
   *
   * Questo test **non asserisce niente** e non cambia il comportamento: stampa,
   * per ognuna delle domande del corpus, i segnali che un criterio relativo
   * potrebbe usare, separati fra domande con risposta e senza. È la misura che
   * deve venire PRIMA della decisione — e sta qui e non in un foglio di calcolo
   * perché l'unico posto dove gira l'embedder vero è la CI.
   *
   * I segnali, e cosa vorrebbero dire:
   * - `top1` — la similarità migliore. Già misurata, già insufficiente.
   * - `gap` — quanto il primo stacca il secondo. L'idea: una risposta vera
   *   emerge, un plateau di mediocri no.
   * - `gapRel` — lo stesso distacco in proporzione al primo, per non dipendere
   *   dal livello assoluto.
   * - `plateau` — quanto il primo stacca la MEDIA degli altri: più stabile del
   *   solo secondo, che può essere un quasi-duplicato legittimo.
   * - `bothArms` — se il primo è stato trovato da entrambi i bracci (vettoriale
   *   e lessicale). Due strade che convergono sono un indizio che un coseno da
   *   solo non ha.
   * - `lexHits` — quanti dei k hanno un aggancio lessicale: zero significa che
   *   nessuna parola della domanda compare da nessuna parte.
   */
  it("misura i segnali per un criterio relativo di astensione (gruppo 1)", async () => {
    const rows: Record<string, unknown>[] = [];
    for (const question of corpus.questions) {
      const found = await searchMemories(db, embedder, question.query, K, NOW);
      await db.update(memories).set({ lastAccessed: null });

      const sims = found.map((memory) => memory.similarity);
      const top1 = sims[0] ?? 0;
      const rest = sims.slice(1);
      const mean = rest.length === 0 ? 0 : rest.reduce((a, b) => a + b, 0) / rest.length;
      const first = found[0];
      rows.push({
        famiglia: question.family,
        // `astensione` è l'unica famiglia in cui la risposta giusta NON esiste
        risposta: question.family === "astensione" ? "no" : "si",
        query: question.query,
        trovati: found.length,
        top1: Number(top1.toFixed(4)),
        gap: Number((top1 - (sims[1] ?? 0)).toFixed(4)),
        gapRel: top1 === 0 ? 0 : Number(((top1 - (sims[1] ?? 0)) / top1).toFixed(4)),
        plateau: Number((top1 - mean).toFixed(4)),
        bothArms: first?.vectorRank !== undefined && first.lexicalRank !== undefined,
        lexHits: found.filter((memory) => memory.lexicalRank !== undefined).length,
      });
    }
    // l'evidenza riproducibile: si legge dai log della CI, dove l'embedder vero
    // gira davvero, e da lì si sceglie il criterio con i numeri sotto gli occhi
    console.log(`segnali di astensione @k=${String(K)}\n${JSON.stringify(rows, null, 2)}`);
    expect(rows).toHaveLength(corpus.questions.length);
  });

  /**
   * Il giudice al banco (ADR-107), e **non asserisce ancora niente**.
   *
   * ADR-106 ha chiuso la strada dei segnali di forma: `gap` e `plateau` sono
   * rovesciati, `top1` si sovrappone. Resta il significato, e a guardarlo è il
   * modello di casa. Qui si misura quanto ci prende, sulle stesse venti
   * domande — dieci con risposta e dieci senza.
   *
   * **Le due direzioni d'errore non pesano uguale**, e la tabella le tiene
   * separate apposta: astenersi da una risposta che esiste (`persa`) è il
   * danno peggiore — UGO dice «non lo so» di una cosa che sa — mentre
   * rispondere a vuoto (`inventata`) resta una conversazione fastidiosa.
   * Il floor si alzerà solo dopo aver letto questi numeri, e solo a quelli.
   */
  it("misura il giudice locale sulle venti domande, e non scende sotto il misurato (ADR-107)", async () => {
    const rows: Record<string, unknown>[] = [];
    let riconosciute = 0;
    let perse = 0;
    let inventate = 0;
    let chieste = 0;

    for (const question of corpus.questions) {
      const found = await searchMemories(db, embedder, question.query, K, NOW);
      await db.update(memories).set({ lastAccessed: null });
      const verdict = await canAnswer({ local: judge }, question.query, found);

      const haRisposta = question.family !== "astensione";
      if (verdict.asked) chieste += 1;
      if (!haRisposta && !verdict.answerable) riconosciute += 1;
      if (haRisposta && !verdict.answerable) perse += 1;
      if (!haRisposta && verdict.answerable) inventate += 1;

      rows.push({
        risposta: haRisposta ? "si" : "no",
        verdetto: verdict.answerable ? "rispondo" : "non lo so",
        esito:
          haRisposta === verdict.answerable
            ? "giusto"
            : haRisposta
              ? "PERSA (il danno peggiore)"
              : "inventata",
        chiesto: verdict.asked,
        said: verdict.said === undefined ? undefined : verdict.said.slice(0, 24),
        query: question.query,
      });
    }

    const senza = corpus.questions.filter((q) => q.family === "astensione").length;
    const con = corpus.questions.length - senza;
    console.log(
      `giudice dell'astensione (${TEXT_MODEL})\n` +
        JSON.stringify(
          {
            riconosciute: `${String(riconosciute)}/${String(senza)}`,
            perse: `${String(perse)}/${String(con)}`,
            inventate: `${String(inventate)}/${String(senza)}`,
            chiamateAlModello: `${String(chieste)}/${String(corpus.questions.length)}`,
            dettaglio: rows,
          },
          null,
          2,
        ),
    );
    expect(rows).toHaveLength(corpus.questions.length);

    /**
     * I floor, **ai valori misurati** e non a quelli desiderati (run
     * 32218211586, `qwen2.5:1.5b` + prompt A). Salgono e non scendono, come
     * quelli delle famiglie.
     *
     * `perse` ha un TETTO invece di un pavimento perché è l'errore che pesa di
     * più: se una modifica ne facesse perdere due, il banco deve diventare
     * rosso anche se tutto il resto migliora. È già successo due volte — col
     * prompt riscritto e col modello raddoppiato — e ogni volta la CI l'ha
     * detto solo perché qualcuno andava a leggere i log. Adesso lo dice da sé.
     */
    expect(riconosciute, "riconosciute sotto il misurato").toBeGreaterThanOrEqual(senza);
    expect(inventate, "ha risposto a vuoto: non era mai successo").toBe(0);
    expect(perse, "perse oltre il misurato — e perse pesa più di inventate").toBeLessThanOrEqual(1);
  }, 180_000);

  it("still cannot abstain: the similarity bands overlap (ADR-022)", async () => {
    // Measured, not assumed. Across this corpus the best similarity for a
    // question with no answer reaches 0.604, 0.637 and 0.672, while a question
    // with an answer starts at 0.624 — the two ranges overlap, so no absolute
    // cut separates them. MIN_SIMILARITY sits at 0.6 to drop obvious noise, and
    // deliberately not at the 0.675 that would "pass" this corpus by four
    // thousandths of fitted margin.
    //
    // Abstention therefore needs a mechanism that is not a threshold on cosine.
    // It stays open in the backlog, and this test holds the evidence.
    const found = await searchMemories(
      db,
      embedder,
      "qual e il codice IBAN del conto corrente?",
      K,
      NOW,
    );
    await db.update(memories).set({ lastAccessed: null });
    expect(found.length).toBeGreaterThan(0);
  });

  it("finds a code and a proper noun that similarity alone missed (ADR-022)", async () => {
    // The two cases the hybrid arm exists for. The number plate has a poor
    // cosine (0.624) and an exact token; "Ferretti" is named inside a memory
    // that is otherwise about boilers.
    for (const [query, key] of [
      ["GK492NR", "targa-auto"],
      ["chi e il tecnico Ferretti?", "caldaia-modello"],
    ] as const) {
      const found = await searchMemories(db, embedder, query, K, NOW);
      await db.update(memories).set({ lastAccessed: null });
      expect(found[0]?.id, `${query} should surface ${key} first`).toBe(idByKey.get(key));
    }
  });

  it("does not let the lexical arm resurrect an invalidated memory", async () => {
    // The classic way to get this wrong is to filter `invalidated_at is null`
    // on the vector arm only, and let a retired fact back in through the side
    // door. "Ferrari" appears verbatim in the retired job memory and nowhere
    // else, so the lexical arm would find it if the filter were missing.
    const retired = idByKey.get("ivan-lavoro-vecchio");
    const found = await searchMemories(db, embedder, "Ferrari trasporti autista", K, NOW);
    await db.update(memories).set({ lastAccessed: null });
    expect(found.map((memory) => memory.id)).not.toContain(retired);
  });
});
