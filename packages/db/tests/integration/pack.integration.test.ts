import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { BeingFactory } from "@ugo/factories";
import { openEmbedding, parseDataKey, sealEmbedding } from "@ugo/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import {
  PRIME_GOSINO_ID,
  PRIME_HOUSEHOLD_ID,
  beings,
  bonds,
  corrections,
  diaryEntries,
  gosini,
  households,
  memories,
  memoryBeings,
  perceptionEvents,
  recognitionProfiles,
  relations,
  traitSets,
} from "../../src/schema/index.js";

/**
 * Pack integrity against a real Postgres (ADR-014/015/016). What is checked
 * here are the promises the schema itself has to keep — the ones application
 * code must not be trusted to remember.
 */

const DATA_KEY = parseDataKey(Buffer.alloc(32, 7).toString("base64"));

let container: StartedPostgreSqlContainer;
let db: DbClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  await runMigrations(container.getConnectionUri());
  db = createDbClient(container.getConnectionUri());
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

beforeEach(async () => {
  await db.execute(sql`
    truncate beings, bonds, relations, recognition_profiles, perception_events,
             corrections, memory_beings, memories, trait_sets cascade
  `);
  await db.execute(sql`delete from gosini where id <> ${PRIME_GOSINO_ID}`);
});

const insertBeing = async (
  overrides: Partial<Parameters<typeof BeingFactory.create>[0]> = {},
) => {
  // ADR-048 tempo 2: la casa non ha piu' un default, quindi la si dice. Qui e'
  // sempre quella seminata, che e' l'unica che questi test conoscono.
  const input = BeingFactory.create({ householdId: PRIME_HOUSEHOLD_ID, ...overrides });
  const [row] = await db.insert(beings).values(input).returning({ id: beings.id });
  if (row === undefined) throw new Error("insert failed");
  return { id: row.id, input };
};

describe("the pack", () => {
  it("holds a mixed household without a table per species", async () => {
    const pack = await Promise.all([
      insertBeing({ species: "human", displayName: "Ivan" }),
      insertBeing({ species: "human", displayName: "Sofia", isMinor: true }),
      insertBeing({ species: "dog", displayName: "Argo" }),
      insertBeing({ species: "parrot", displayName: "Nina" }),
      insertBeing({ species: "parrot", displayName: "Zeno" }),
      insertBeing({ species: "reptile", displayName: "Ugo il geco", noAudio: true }),
    ]);
    expect(pack).toHaveLength(6);

    const rows = await db.select({ species: beings.species }).from(beings);
    expect(new Set(rows.map((row) => row.species))).toEqual(
      new Set(["human", "dog", "parrot", "reptile"]),
    );
    // a species nobody planned for must be accepted, not rejected
    await expect(insertBeing({ species: "axolotl", displayName: "Xolo" })).resolves.toBeDefined();
    // `kind` is closed, and the database is the one that says so
    await expect(
      db.execute(sql`insert into beings (display_name, kind) values ('X', 'padrone')`),
    ).rejects.toThrow();
  });

  it("lets two exemplars disagree about the same being", async () => {
    const [other] = await db
      .insert(gosini)
      .values({
        householdId: PRIME_HOUSEHOLD_ID,
        name: "ugo-officina",
        locationLabel: "officina",
        generation: 0,
      })
      .returning({ id: gosini.id });
    const ivan = await insertBeing({ displayName: "Ivan" });
    if (other === undefined) throw new Error("second exemplar not created");

    // due esemplari, una casa sola: e' esattamente la promessa di ADR-014
    const house = { householdId: PRIME_HOUSEHOLD_ID };
    await db.insert(bonds).values([
      { ...house, gosinoId: PRIME_GOSINO_ID, beingId: ivan.id, familiarity: 0.9, affinity: 0.8 },
      { ...house, gosinoId: other.id, beingId: ivan.id, familiarity: 0.1, affinity: -0.4 },
    ]);

    const [home] = await db
      .select({ affinity: bonds.affinity })
      .from(bonds)
      .where(and(eq(bonds.gosinoId, PRIME_GOSINO_ID), eq(bonds.beingId, ivan.id)));
    const [workshop] = await db
      .select({ affinity: bonds.affinity })
      .from(bonds)
      .where(and(eq(bonds.gosinoId, other.id), eq(bonds.beingId, ivan.id)));
    expect(home?.affinity).toBeCloseTo(0.8);
    expect(workshop?.affinity).toBeCloseTo(-0.4);

    // one opinion per exemplar per being, and no impossible values
    await expect(
      db.insert(bonds).values({ ...house, gosinoId: PRIME_GOSINO_ID, beingId: ivan.id }),
    ).rejects.toThrow();
    await expect(
      db.insert(bonds).values({ ...house, gosinoId: other.id, beingId: ivan.id, affinity: 3 }),
    ).rejects.toThrow();
  });

  it("keeps the graph between the others honest", async () => {
    const ivan = await insertBeing({ displayName: "Ivan" });
    const paola = await insertBeing({ displayName: "Paola" });
    const sofia = await insertBeing({ displayName: "Sofia", isMinor: true });

    const house = { householdId: PRIME_HOUSEHOLD_ID };

    // asymmetric: direction carries the meaning
    await db.insert(relations).values({ ...house, beingA: ivan.id, beingB: sofia.id, type: "parent_of" });
    await db.insert(relations).values({ ...house, beingA: paola.id, beingB: sofia.id, type: "parent_of" });

    // symmetric: stored once, normalized, so the mirror image is impossible
    const [low, high] = [ivan.id, paola.id].sort();
    if (low === undefined || high === undefined) throw new Error("unreachable");
    await db.insert(relations).values({ ...house, beingA: low, beingB: high, type: "partner_of" });
    await expect(
      db.insert(relations).values({ ...house, beingA: high, beingB: low, type: "partner_of" }),
    ).rejects.toThrow();

    // nobody is their own parent
    await expect(
      db.insert(relations).values({ ...house, beingA: ivan.id, beingB: ivan.id, type: "cares_for" }),
    ).rejects.toThrow();
  });

  it("versions the genome as an immutable chain", async () => {
    const [first] = await db
      .insert(traitSets)
      .values({
        householdId: PRIME_HOUSEHOLD_ID,
        gosinoId: PRIME_GOSINO_ID,
        version: 1,
        traits: { curiosita: 0.6 },
      })
      .returning({ id: traitSets.id });
    if (first === undefined) throw new Error("no trait set");
    await db.insert(traitSets).values({
      householdId: PRIME_HOUSEHOLD_ID,
      gosinoId: PRIME_GOSINO_ID,
      version: 2,
      traits: { curiosita: 0.62 },
      parentTraitSetId: first.id,
      mutationNote: "settimana curiosa",
    });

    await expect(
      db.insert(traitSets).values({
        householdId: PRIME_HOUSEHOLD_ID,
        gosinoId: PRIME_GOSINO_ID,
        version: 2,
        traits: {},
      }),
    ).rejects.toThrow();

    const chain = await db
      .select({ version: traitSets.version, parent: traitSets.parentTraitSetId })
      .from(traitSets)
      .orderBy(traitSets.version);
    expect(chain.map((row) => row.version)).toEqual([1, 2]);
    expect(chain[1]?.parent).toBe(first.id);
  });

  it("records a perception nobody could attribute without breaking", async () => {
    const paola = await insertBeing({ displayName: "Paola" });
    await db.insert(perceptionEvents).values({
      gosinoId: PRIME_GOSINO_ID,
      modality: "audio_speech",
      candidateBeingId: paola.id,
      confidence: 0.62,
      observed: { seconds: 4 },
    });

    const [row] = await db
      .select({
        beingId: perceptionEvents.beingId,
        candidate: perceptionEvents.candidateBeingId,
        confidence: perceptionEvents.confidence,
      })
      .from(perceptionEvents);
    // unknown is a first-class outcome, not an error state
    expect(row?.beingId).toBeNull();
    expect(row?.candidate).toBe(paola.id);
    expect(row?.confidence).toBeCloseTo(0.62);
  });

  it("stores a biometric profile only as ciphertext", async () => {
    const ivan = await insertBeing({ displayName: "Ivan" });
    const centroid = [0.1, -0.25, 0.5, 0.75];
    await db.insert(recognitionProfiles).values({
      householdId: PRIME_HOUSEHOLD_ID,
      beingId: ivan.id,
      modality: "voice",
      model: "mfcc-stats-v1",
      dimensions: centroid.length,
      payload: sealEmbedding(centroid, DATA_KEY),
      sampleCount: 1,
    });

    const [row] = await db
      .select({ payload: recognitionProfiles.payload })
      .from(recognitionProfiles);
    if (row === undefined) throw new Error("no profile");
    expect(row.payload.subarray(0, 4).toString("ascii")).toBe("UGO1");
    expect(openEmbedding(row.payload, DATA_KEY)).toEqual(
      centroid.map((value) => Math.fround(value)),
    );

    // erasure destroys the voiceprint with the being — no orphan biometrics
    await db.delete(beings).where(eq(beings.id, ivan.id));
    expect(await db.select().from(recognitionProfiles)).toHaveLength(0);
  });

  it("links memories to the beings they are about, and corrections to both", async () => {
    const ivan = await insertBeing({ displayName: "Ivan" });
    const paola = await insertBeing({ displayName: "Paola" });
    const [memory] = await db
      .insert(memories)
      .values({
        gosinoId: PRIME_GOSINO_ID,
        kind: "fact",
        text: "Ivan ripara le radio a valvole",
      })
      .returning({ id: memories.id });
    if (memory === undefined) throw new Error("no memory");

    const link = { householdId: PRIME_HOUSEHOLD_ID, memoryId: memory.id, beingId: ivan.id };
    await db.insert(memoryBeings).values(link);
    await expect(db.insert(memoryBeings).values(link)).rejects.toThrow();

    await db.insert(corrections).values({
      gosinoId: PRIME_GOSINO_ID,
      beingId: paola.id,
      aboutBeing: ivan.id,
      signal: "wrong_name",
    });
    const [correction] = await db
      .select({ signal: corrections.signal, about: corrections.aboutBeing })
      .from(corrections);
    expect(correction?.signal).toBe("wrong_name");
    expect(correction?.about).toBe(ivan.id);

    // forgetting a being must not erase the correction's existence
    await db.delete(beings).where(eq(beings.id, ivan.id));
    const [surviving] = await db
      .select({ about: corrections.aboutBeing })
      .from(corrections);
    expect(surviving?.about).toBeNull();
    expect(await db.select().from(memoryBeings)).toHaveLength(0);
  });
});

/**
 * ADR-048: the four tables that could not say which house they belonged to.
 * The interesting half is not that the column exists — it is that Postgres
 * refuses a row whose house disagrees with its parent's, so the two can never
 * drift apart by a forgotten line of code.
 */
describe("le colonne che rendono possibile RLS", () => {
  it("refuses a genome that claims a house its creature does not live in", async () => {
    const [altra] = await db
      .insert(households)
      .values({ slug: "casa-altrove", name: "altrove" })
      .returning({ id: households.id });
    if (altra === undefined) throw new Error("no household");

    await expect(
      db.insert(traitSets).values({
        gosinoId: PRIME_GOSINO_ID,
        householdId: altra.id,
        version: 99,
        traits: {},
      }),
    ).rejects.toThrow();

    // and the honest pair goes in, so the test cannot pass on a typo
    await expect(
      db.insert(traitSets).values({
        gosinoId: PRIME_GOSINO_ID,
        householdId: PRIME_HOUSEHOLD_ID,
        version: 98,
        traits: {},
      }),
    ).resolves.toBeDefined();
  });

  it("refuses a voiceprint filed under the wrong house", async () => {
    const ivan = await insertBeing({ displayName: "Ivan Profilo" });
    const [altra] = await db
      .select({ id: households.id })
      .from(households)
      .where(ne(households.id, PRIME_HOUSEHOLD_ID))
      .limit(1);
    if (altra === undefined) throw new Error("no second household");

    await expect(
      db.insert(recognitionProfiles).values({
        beingId: ivan.id,
        householdId: altra.id,
        modality: "voice",
        model: "ecapa-voxceleb-v1",
        dimensions: 4,
        payload: sealEmbedding([0.1, 0.2, 0.3, 0.4], DATA_KEY),
        sampleCount: 1,
      }),
    ).rejects.toThrow();
  });

  it("lets two exemplars keep a diary of the same day", async () => {
    const [studio] = await db
      .insert(gosini)
      .values({ householdId: PRIME_HOUSEHOLD_ID, name: "ugo-diario" })
      .returning({ id: gosini.id });
    if (studio === undefined) throw new Error("no exemplar");

    await db
      .insert(diaryEntries)
      .values({ gosinoId: PRIME_GOSINO_ID, date: "2026-08-12", text: "giornata mia" });
    // the same date for somebody else used to be a unique violation, so the
    // second creature to dream silently overwrote the first one's diary
    await expect(
      db
        .insert(diaryEntries)
        .values({ gosinoId: studio.id, date: "2026-08-12", text: "giornata sua" }),
    ).resolves.toBeDefined();

    // and the same exemplar still gets one entry per day
    await expect(
      db
        .insert(diaryEntries)
        .values({ gosinoId: PRIME_GOSINO_ID, date: "2026-08-12", text: "un doppione" }),
    ).rejects.toThrow();
  });
});

