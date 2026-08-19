import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  births,
  createDbClient,
  type DbClient,
  gosini,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../../src/services/accountService.js";
import { buildServer } from "../../src/server.js";

/**
 * La cucciolata tocca il database (ADR-069).
 *
 * Il motore è puro e ha i suoi unit test; quello che solo un Postgres vero può
 * dire è il tratto fra il motore e le righe: che il seed attraversi l'HTTP e
 * torni la stessa cucciolata, che il lignaggio venga scritto per OGNI
 * genitore, che lo screening blocchi una nascita e che la casa del vicino
 * risponda 404 come una casa vuota.
 *
 * Gli id dei genitori sono artigianali: il ceppo di un fondatore si deriva
 * dai primi 8 esadecimali dell'id (ADR-069 §2), e un test che pesca ceppi a
 * caso collide una volta su otto.
 */

const MASTER_KEY = randomBytes(32);
/** ADR-070: la chiave con cui le firme dei genitori restano cifrate a riposo. */
const DATA_KEY = randomBytes(32);

const P1 = "00000001-0000-4000-8000-000000000001"; // ceppo 1
const P2 = "00000002-0000-4000-8000-000000000002"; // ceppo 2
const CLONE = "00000003-0000-4000-8000-000000000003"; // ceppo 3, genoma di P1
const SAME_CEPPO = "00000009-0000-4000-8000-000000000009"; // 9 % 8 = 1, come P1
const S1 = "00000004-0000-4000-8000-000000000004"; // ceppo 4, quasi spento
const S2 = "00000005-0000-4000-8000-000000000005"; // ceppo 5, quasi spento

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let houseA: string;
let tokenA: string;
let tokenB: string;

const post = (url: string, token: string, body: unknown) =>
  app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  // ADR-081: fare cucciolate è un mestiere autorizzato. Queste due case sono
  // allevamenti, e va detto qui — una casa qualunque riceverebbe 403, che è
  // esattamente ciò che deve succedere
  const a = await createAccount(db, MASTER_KEY, {
    slug: "casa-a",
    name: "A",
    breeder: true,
  });
  const b = await createAccount(db, MASTER_KEY, {
    slug: "casa-b",
    name: "B",
    breeder: true,
  });
  houseA = a.accountId;
  tokenA = a.ownerToken;
  tokenB = b.ownerToken;

  const seedParent = async (
    id: string,
    name: string,
    traits: Record<string, number>,
    generation = 0,
  ): Promise<void> => {
    await db.insert(gosini).values({ id, accountId: houseA, name, generation });
    await db.insert(traitSets).values({ accountId: houseA, gosinoId: id, version: 1, traits });
  };
  await seedParent(P1, "Placida", { calm: 0.9, curiosity: 0.2, talkativeness: 0.25 });
  await seedParent(P2, "Ciarla", { calm: 0.3, curiosity: 0.8, boldness: 0.7 }, 3);
  await seedParent(CLONE, "Fotocopia", { calm: 0.9, curiosity: 0.2, talkativeness: 0.25 });
  await seedParent(SAME_CEPPO, "Omoceppo", { affection: 0.9 });
  await seedParent(S1, "Muto", {
    curiosity: 0.02,
    affection: 0.03,
    talkativeness: 0.02,
    calm: 0.9,
  });
  await seedParent(S2, "Sordo", {
    curiosity: 0.03,
    affection: 0.02,
    talkativeness: 0.04,
    calm: 0.1,
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      // ADR-070: con la chiave, le nascite sono firmate dai genitori
      gosini: { dataKey: DATA_KEY },
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("POST /v1/gosini/litters", () => {
  it("same seed over HTTP, same litter — the preview is arithmetic", async () => {
    const body = { parentIds: [P1, P2], seed: 42 };
    const una = await post("/v1/gosini/litters", tokenA, body);
    const due = await post("/v1/gosini/litters", tokenA, body);
    expect(una.statusCode).toBe(200);
    const first = una.json<{ seed: number; cubs: { traits: Record<string, number> }[] }>();
    expect(first.seed).toBe(42);
    expect(first.cubs).toHaveLength(4);
    expect(due.json()).toEqual(first);
    // the new coat genes travel with every cub, ready for the muzzle
    expect(first.cubs[0]?.traits).toHaveProperty("spots");
    expect(first.cubs[0]?.traits).toHaveProperty("tail");
  });

  it("hands out a seed when none is given, so the adoption can name it back", async () => {
    const response = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, P2] });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ seed: number }>().seed).toBeGreaterThanOrEqual(0);
  });

  it("refuses the ring's edges with the engine's own words", async () => {
    const twins = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, CLONE] });
    expect(twins.statusCode).toBe(422);
    expect(twins.json<{ error: string }>().error).toBe("troppo-simili");

    const cousins = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, SAME_CEPPO] });
    expect(cousins.statusCode).toBe(422);
    expect(cousins.json<{ error: string }>().error).toBe("ceppi-uguali");
  });

  it("marks a degenerate cub as not viable instead of hiding it", async () => {
    const response = await post("/v1/gosini/litters", tokenA, { parentIds: [S1, S2], seed: 7 });
    expect(response.statusCode).toBe(200);
    const { cubs } = response.json<{ cubs: { viable: boolean; reasons?: string[] }[] }>();
    expect(cubs.every((cub) => !cub.viable)).toBe(true);
    expect(cubs[0]?.reasons?.join(" ")).toMatch(/spento/);
  });

  it("shows the neighbour's parents as missing, not as forbidden", async () => {
    const response = await post("/v1/gosini/litters", tokenB, { parentIds: [P1, P2] });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /v1/gosini/births", () => {
  it("adopts one cub: lineage for every parent, genome version 1, generation from the eldest", async () => {
    const preview = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, P2], seed: 42 });
    const chosen = preview.json<{ cubs: { traits: Record<string, number> }[] }>().cubs[1];

    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [P1, P2],
      seed: 42,
      cubIndex: 1,
      name: "Nino",
    });
    expect(response.statusCode).toBe(201);
    const born = response.json<{ id: string; generation: number; persona: string }>();
    // Ciarla is generation 3: the child counts from the eldest parent
    expect(born.generation).toBe(4);

    const [row] = await db.select().from(gosini).where(eq(gosini.id, born.id));
    expect(row?.parentGosinoId).toBe(P1);
    expect(row?.generation).toBe(4);

    const lineage = await db.select().from(births).where(eq(births.childGosinoId, born.id));
    expect(lineage.map((r) => r.parentGosinoId).sort()).toEqual([P1, P2]);

    const [genome] = await db.select().from(traitSets).where(eq(traitSets.gosinoId, born.id));
    expect(genome?.version).toBe(1);
    expect(genome?.mutationNote).toContain("seed=42");
    const stored = genome?.traits as { ceppo: number; alleles: Record<string, unknown> };
    expect(stored.alleles).toBeDefined();
    expect(stored.ceppo).toBeGreaterThanOrEqual(0);
    // what was adopted is what was previewed: the seed kept its promise
    for (const [key, value] of Object.entries(chosen?.traits ?? {})) {
      expect((stored as unknown as Record<string, number>)[key]).toBeCloseTo(value, 10);
    }
  });

  it("refuses to give birth to a cub the screen rejected", async () => {
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [S1, S2],
      seed: 7,
      cubIndex: 0,
      name: "Spento",
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: string }>().error).toBe("cucciolo non vitale");
  });

  it("wants a room that exists, like the manual birth", async () => {
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [P1, P2],
      seed: 42,
      cubIndex: 0,
      name: "Senzatetto",
      locationLabel: "garage",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("stanza sconosciuta");
  });

  it("keeps the neighbour out of the delivery room", async () => {
    const response = await post("/v1/gosini/births", tokenB, {
      parentIds: [P1, P2],
      seed: 42,
      cubIndex: 0,
      name: "Intruso",
    });
    expect(response.statusCode).toBe(404);
  });
});

/**
 * Il pedigree (ADR-070). Una riga di database non è una genealogia: chiunque
 * scriva sul database può inventarsi una discendenza. Qui si prova che la
 * firma serve davvero — cioè che una manomissione si VEDE.
 */
describe("GET /v1/gosini/:id/pedigree", () => {
  const pedigreeOf = (id: string, token: string) =>
    app.inject({
      method: "GET",
      url: `/v1/gosini/${id}/pedigree`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("nasce firmato da entrambi i genitori, e le firme reggono", async () => {
    const born = await post("/v1/gosini/births", tokenA, {
      parentIds: [P1, P2],
      seed: 99,
      cubIndex: 0,
      name: "Firmato",
    });
    const childId = born.json<{ id: string }>().id;

    // la firma è nelle righe, e la chiave pubblica viaggia con lei: è ciò che
    // rende il certificato verificabile senza il nostro registro
    const rows = await db.select().from(births).where(eq(births.childGosinoId, childId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.signature).not.toBeNull();
      expect(row.parentPublicKey).not.toBeNull();
    }

    const response = await pedigreeOf(childId, tokenA);
    expect(response.statusCode).toBe(200);
    const tree = response.json<{ pedigree: PedigreeShape[] }>().pedigree;
    const child = tree.find((node) => node.id === childId);
    expect(child?.parents.map((p) => p.verdict)).toEqual(["valid", "valid"]);
    // e risale: i genitori sono nell'albero, fondatori senza genitori
    expect(tree.map((node) => node.id).sort()).toEqual([childId, P1, P2].sort());
    expect(tree.find((node) => node.id === P1)?.parents).toEqual([]);
  });

  it("una manomissione del genoma rende l'atto invalid: è il punto della firma", async () => {
    const born = await post("/v1/gosini/births", tokenA, {
      parentIds: [P1, P2],
      seed: 123,
      cubIndex: 0,
      name: "Manomesso",
    });
    const childId = born.json<{ id: string }>().id;

    const before = await pedigreeOf(childId, tokenA);
    const beforeChild = before
      .json<{ pedigree: PedigreeShape[] }>()
      .pedigree.find((node) => node.id === childId);
    expect(beforeChild?.parents.every((p) => p.verdict === "valid")).toBe(true);

    // qualcuno "migliora" il genoma del cucciolo direttamente sul database
    const [genome] = await db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, childId));
    await db
      .update(traitSets)
      .set({ traits: { ...(genome?.traits as object), calm: 0.999 } })
      .where(eq(traitSets.gosinoId, childId));

    const after = await pedigreeOf(childId, tokenA);
    const afterChild = after
      .json<{ pedigree: PedigreeShape[] }>()
      .pedigree.find((node) => node.id === childId);
    expect(afterChild?.parents.map((p) => p.verdict)).toEqual(["invalid", "invalid"]);
  });

  it("un fondatore resta unsigned, non invalid: non è un falsario", async () => {
    const response = await pedigreeOf(P1, tokenA);
    const tree = response.json<{ pedigree: PedigreeShape[] }>().pedigree;
    expect(tree).toHaveLength(1);
    expect(tree[0]?.parents).toEqual([]);
    expect(tree[0]?.genomeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("il pedigree del vicino non esiste", async () => {
    const response = await pedigreeOf(P1, tokenB);
    expect(response.statusCode).toBe(404);
  });
});

interface PedigreeShape {
  id: string;
  genomeHash?: string;
  parents: { id: string; name: string; verdict: string }[];
}
