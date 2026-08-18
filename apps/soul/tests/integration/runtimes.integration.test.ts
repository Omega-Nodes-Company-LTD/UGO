import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  desires,
  events,
  gosini,
  accounts,
  PRIME_GOSINO_ID,
  psycheSnapshots,
  runMigrations,
} from "@ugo/db";
import { searchMemories, writeMemory, type EmbeddingsClient } from "@ugo/memory";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PsycheService } from "../../src/services/psycheService.js";

/**
 * Two exemplars under one roof (ADR-032).
 *
 * Every assertion here is about SEPARATION, because the failure this feature
 * has to avoid is silent: a missing `where` does not throw, it just quietly
 * hands one creature the other one's memories. Two gosini were one creature
 * with two names until this existed.
 *
 * The embedder is fixed at the object boundary rather than run for real: what
 * is under test is the scope of the query, not the quality of a vector, and a
 * constant vector makes "who got which row" unambiguous.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let ugo: string;
let nino: string;

/** Same vector every time: similarity is not what these tests are about. */
const flatEmbedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0.02))),
};

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const houses = await db.select({ id: accounts.id }).from(accounts).limit(1);
  const accountId = houses[0]?.id;
  if (accountId === undefined) throw new Error("the migrations seed one account");
  const born = await db
    .insert(gosini)
    .values([
      { accountId, name: "Ugo", locationLabel: "cucina" },
      { accountId, name: "Nino", locationLabel: "studio" },
    ])
    .returning({ id: gosini.id });
  ugo = born[0]?.id ?? "";
  nino = born[1]?.id ?? "";
}, 240_000);

afterAll(async () => {
  await pg.stop();
});

describe("two exemplars in one house", () => {
  it("keeps their memories apart, in both arms of the hybrid search", async () => {
    await writeMemory(db, flatEmbedder, {
      gosinoId: ugo,
      kind: "fact",
      text: "il fattorino si chiama Ivan",
    });
    await writeMemory(db, flatEmbedder, {
      gosinoId: nino,
      kind: "fact",
      text: "la vicina si chiama Paola",
    });

    // the lexical arm is the one that leaks if only the vector arm is scoped:
    // an exact word match would find the other's row through the other side
    const ugoFinds = await searchMemories(db, flatEmbedder, "Paola", 5, new Date(), ugo);
    expect(ugoFinds.map((m) => m.text)).not.toContain("la vicina si chiama Paola");

    const ninoFinds = await searchMemories(db, flatEmbedder, "Ivan", 5, new Date(), nino);
    expect(ninoFinds.map((m) => m.text)).not.toContain("il fattorino si chiama Ivan");

    // and each still finds his own
    const own = await searchMemories(db, flatEmbedder, "Ivan", 5, new Date(), ugo);
    expect(own.map((m) => m.text)).toContain("il fattorino si chiama Ivan");
  });

  it("gives each his own mood: perturbing one does not move the other", async () => {
    const ugoPsyche = await PsycheService.restore(db, new Date(), ugo);
    const ninoPsyche = await PsycheService.restore(db, new Date(), nino);
    const before = ninoPsyche.current().vars.stress;

    // three bangs, all of them Ugo's
    for (let i = 0; i < 3; i += 1) await ugoPsyche.applyEventType("loud_noise");

    expect(ugoPsyche.current().vars.stress).toBeGreaterThan(before);
    expect(ninoPsyche.current().vars.stress).toBeCloseTo(before, 5);
  });

  it("writes each snapshot under its own name, so a restart restores the right one", async () => {
    const ugoPsyche = await PsycheService.restore(db, new Date(), ugo);
    await ugoPsyche.applyEventType("went_out");
    await ugoPsyche.snapshot();

    const mine = await db
      .select({ id: psycheSnapshots.id })
      .from(psycheSnapshots)
      .where(eq(psycheSnapshots.gosinoId, ugo));
    const theirs = await db
      .select({ id: psycheSnapshots.id })
      .from(psycheSnapshots)
      .where(eq(psycheSnapshots.gosinoId, nino));
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs).toHaveLength(0);

    // and restoring Nino must not pick up Ugo's snapshot
    const restored = await PsycheService.restore(db, new Date(), nino);
    expect(restored.current().vars.noia).toBeGreaterThan(
      ugoPsyche.current().vars.noia,
    );
  });

  it("keeps their intentions apart: one cannot say the other's desire", async () => {
    await db.insert(desires).values([
      { gosinoId: ugo, text: "domanda di Ugo?", status: "pending" },
      { gosinoId: nino, text: "domanda di Nino?", status: "pending" },
    ]);
    const ugoPending = await db
      .select({ text: desires.text })
      .from(desires)
      .where(eq(desires.gosinoId, ugo));
    expect(ugoPending.map((row) => row.text)).toEqual(["domanda di Ugo?"]);
  });

  it("keeps their journals apart, which is what the cooldowns read back", async () => {
    await db.insert(events).values([
      { gosinoId: ugo, source: "system", type: "initiative_taken", payload: { gosinoId: PRIME_GOSINO_ID, act: "nudge" } },
    ]);
    const ninoHistory = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.gosinoId, nino));
    expect(ninoHistory).toHaveLength(0);
  });

  it("does not leave the old single-exemplar behaviour scoped to nobody", async () => {
    // an unscoped search still sees everything: that is the single-exemplar
    // house, and it must keep working exactly as it did
    const all = await searchMemories(db, flatEmbedder, "Ivan", 10, new Date());
    expect(all.length).toBeGreaterThan(1);
  });
});
