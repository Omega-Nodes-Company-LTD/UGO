import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  gosini,
  households,
  psycheBaselines,
  runMigrations,
  traitSets,
} from "@ugo/db";
import type { EmbeddingsClient, LlmClient, LocalTextClient } from "@ugo/memory";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARCHETYPES, characterFrom } from "../../src/services/council/character.js";
import { GosinoRegistry } from "../../src/services/pack/runtimes.js";

/**
 * Il genoma pilota davvero (ADR-031, gruppo 5).
 *
 * `trait_sets` esiste dalla nascita dello schema e per mesi non ha pilotato
 * niente: `character.baselines` era **calcolato e buttato via**, quindi un
 * flemmatico ricavava uno stress di riposo basso e la psiche non lo leggeva
 * mai. Due esemplari sotto lo stesso tetto erano due copie identiche con
 * ricordi diversi.
 *
 * Quello che si prova qui e' che due genomi diversi producano due *stati*
 * diversi nel database — non che una funzione pura calcoli i numeri giusti,
 * che e' gia' coperto da un unit test. Il difetto stava nel tratto fra il
 * calcolo e la scrittura, e solo un database vero puo' vederlo.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let calmo: string;
let nervoso: string;

/** Nessuna rete: cio' che si osserva sono righe, non risposte. */
const embedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0.02))),
};
const local: LocalTextClient = {
  generate: () => Promise.resolve(undefined),
  available: () => Promise.resolve(false),
};

const baselinesOf = async (gosinoId: string): Promise<Record<string, number>> => {
  const rows = await db
    .select({ variable: psycheBaselines.variable, baseline: psycheBaselines.baseline })
    .from(psycheBaselines)
    .where(eq(psycheBaselines.gosinoId, gosinoId));
  return Object.fromEntries(rows.map((row) => [row.variable, row.baseline]));
};

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);

  const [house] = await db.select({ id: households.id }).from(households).limit(1);
  if (house === undefined) throw new Error("the migrations seed one household");
  const born = await db
    .insert(gosini)
    .values([
      { householdId: house.id, name: "Placido" },
      { householdId: house.id, name: "Ciarla" },
    ])
    .returning({ id: gosini.id });
  calmo = born[0]?.id ?? "";
  nervoso = born[1]?.id ?? "";

  await db.insert(traitSets).values([
    {
      householdId: house.id,
      gosinoId: calmo,
      version: 1,
      traits: { ...ARCHETYPES.pigrone, talkativeness: 0 },
    },
    {
      householdId: house.id,
      gosinoId: nervoso,
      version: 1,
      traits: { ...ARCHETYPES.brontolone, talkativeness: 1 },
    },
  ]);

  await GosinoRegistry.load({
    db,
    embedder,
    llm: () => undefined as unknown as LlmClient,
    local,
    dataKey: Buffer.alloc(32, 7),
    timezone: "Europe/Rome",
    localModelUp: () => false,
    initiativeEnabled: () => false,
    hourOf: (at) => at.getHours(),
  });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("il genoma arriva fino al database", () => {
  it("writes each exemplar's resting psyche, instead of computing and dropping it", async () => {
    const placido = await baselinesOf(calmo);
    const ciarla = await baselinesOf(nervoso);

    // le cinque variabili ci sono per entrambi: prima non ce n'era nessuna, e
    // `restore()` ripiegava sui neutri del motore per chiunque
    expect(Object.keys(placido).sort()).toEqual([
      "affetto",
      "curiosita",
      "noia",
      "stress",
      "umore",
    ]);

    // e il pigrone riposa piu' calmo del brontolone: e' l'unica asserzione che
    // dice che il GENOMA e' arrivato, e non un default uguale per tutti
    expect(placido.stress).toBeLessThan(ciarla.stress ?? 1);
  });

  /**
   * Le baseline sono del sogno da qui in avanti (ADR-012: ±0.02 a notte). Un
   * riavvio che le riportasse al genoma cancellerebbe ogni settimana vissuta,
   * che e' esattamente cio' che le baseline adattive esistono per ricordare.
   */
  it("never overwrites a baseline the night job has moved", async () => {
    await db
      .update(psycheBaselines)
      .set({ baseline: 0.99 })
      .where(eq(psycheBaselines.gosinoId, calmo));

    await GosinoRegistry.load({
      db,
      embedder,
      llm: () => undefined as unknown as LlmClient,
      local,
      dataKey: Buffer.alloc(32, 7),
      timezone: "Europe/Rome",
      localModelUp: () => false,
      initiativeEnabled: () => false,
      hourOf: (at) => at.getHours(),
    });

    const after = await baselinesOf(calmo);
    expect(after.stress).toBeCloseTo(0.99, 5);
  });

  it("gives a talkative one a longer budget than a quiet one", () => {
    // il consiglio lo usava gia'; la chat no, e un logorroico e un timido
    // rispondevano identici
    const quiet = characterFrom({ ...ARCHETYPES.pigrone, talkativeness: 0 });
    const chatty = characterFrom({ ...ARCHETYPES.pigrone, talkativeness: 1 });
    expect(chatty.maxWords).toBeGreaterThan(quiet.maxWords * 2);
  });
});
