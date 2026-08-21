import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  births,
  budgetLedger,
  createDbClient,
  type DbClient,
  gosini,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { and, eq } from "drizzle-orm";
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
/**
 * ADR-103: da quando la stessa coppia riposa trenta giorni, ogni test che fa
 * NASCERE qualcuno ha bisogno di una coppia sua. Prima ne bastava una: si
 * partoriva sei volte dagli stessi due e non se ne accorgeva nessuno, che è
 * esattamente il comportamento che il riposo esiste per impedire.
 */
const R1 = "00000006-0000-4000-8000-000000000006"; // ceppo 6, come Placida
const R2 = "00000007-0000-4000-8000-000000000007"; // ceppo 7, come Ciarla
const F1 = "00000008-0000-4000-8000-000000000008"; // ceppo 0, come Placida
const F2 = "0000000a-0000-4000-8000-00000000000a"; // ceppo 2, come Ciarla
const M1 = "0000000b-0000-4000-8000-00000000000b"; // ceppo 3, come Placida
const M2 = "0000000c-0000-4000-8000-00000000000c"; // ceppo 4, come Ciarla
const X1 = "00000014-0000-4000-8000-000000000014"; // ceppo 4, come Placida
const X2 = "00000015-0000-4000-8000-000000000015"; // ceppo 5, come Ciarla
/** ADR-105: il genoma riletto vuole un nato suo — il riposo vale anche qui */
const Y1 = "00000016-0000-4000-8000-000000000016"; // ceppo 6, come Placida
const Y2 = "00000017-0000-4000-8000-000000000017"; // ceppo 7, come Ciarla
/** due capostipiti veri: i loro figli sono di seconda generazione, e gratis */
const K1 = "0000000d-0000-4000-8000-00000000000d"; // ceppo 5, come Placida
const K2 = "0000000e-0000-4000-8000-00000000000e"; // ceppo 6, come Ciarla
/** la coppia che prova il riposo, e quella che prova che il riposo è LORO */
const T1 = "0000000f-0000-4000-8000-00000000000f"; // ceppo 7, come Placida
const T2 = "00000010-0000-4000-8000-000000000010"; // ceppo 0, come Ciarla
const T3 = "00000011-0000-4000-8000-000000000011"; // ceppo 1, come Ciarla
/** casa C: allevamento col metabolismo ACCESO, dove il salvadanaio morde */
const C1 = "00000012-0000-4000-8000-000000000012"; // ceppo 2, come Placida
const C2 = "00000013-0000-4000-8000-000000000013"; // ceppo 3, come Ciarla

const PLACIDA = { calm: 0.9, curiosity: 0.2, talkativeness: 0.25 };
const CIARLA = { calm: 0.3, curiosity: 0.8, boldness: 0.7 };

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let houseA: string;
let houseC: string;
let tokenA: string;
let tokenB: string;
let tokenC: string;

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
  const c = await createAccount(db, MASTER_KEY, {
    slug: "casa-c",
    name: "C",
    breeder: true,
  });
  houseA = a.accountId;
  houseC = c.accountId;
  tokenA = a.ownerToken;
  tokenB = b.ownerToken;
  tokenC = c.ownerToken;
  // ADR-072/102: in casa C il metabolismo è acceso, quindi il salvadanaio
  // governa davvero — è l'unica casa in cui una nascita può essere rifiutata
  // per povertà, e serve una casa apposta per provarlo senza sporcare le altre
  await db.update(accounts).set({ metabolism: true }).where(eq(accounts.id, houseC));

  const seedParent = async (
    id: string,
    name: string,
    traits: Record<string, number>,
    generation = 0,
    house = houseA,
  ): Promise<void> => {
    await db.insert(gosini).values({ id, accountId: house, name, generation });
    await db.insert(traitSets).values({ accountId: house, gosinoId: id, version: 1, traits });
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
  // le coppie di scorta: stessi due profili, ceppi diversi, quindi stessa
  // distanza genetica e stesso verdetto di compatibilità
  await seedParent(R1, "Placida II", PLACIDA);
  await seedParent(R2, "Ciarla II", CIARLA, 3);
  await seedParent(F1, "Placida III", PLACIDA);
  await seedParent(F2, "Ciarla III", CIARLA, 3);
  await seedParent(M1, "Placida IV", PLACIDA);
  await seedParent(M2, "Ciarla IV", CIARLA, 3);
  await seedParent(X1, "Placida V", PLACIDA);
  await seedParent(X2, "Ciarla V", CIARLA, 3);
  await seedParent(Y1, "Placida VI", PLACIDA);
  await seedParent(Y2, "Ciarla VI", CIARLA, 3);
  await seedParent(K1, "Adamo", PLACIDA);
  await seedParent(K2, "Eva", CIARLA);
  await seedParent(T1, "Riposa", PLACIDA, 3);
  await seedParent(T2, "Riposo", CIARLA, 3);
  await seedParent(T3, "Terza", CIARLA, 3);
  await seedParent(C1, "Spiantata", PLACIDA, 3, houseC);
  await seedParent(C2, "Spiantato", CIARLA, 3, houseC);

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
    // ADR-103: quanti sono lo dice il seme, non il chiamante. Sei, con questo
    // — e il numero è nel test apposta: se cambiasse, cambierebbe ogni
    // cucciolata già vista in anteprima, e va visto succedere
    expect(first.cubs).toHaveLength(6);
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

  /**
   * ADR-103 — la taglia è un dado, e il dado non si carica.
   *
   * Il test non guarda un numero: guarda che i numeri **cambino** col seme e
   * che stiano nell'intervallo dichiarato. Un motore che rispondesse sempre 4
   * passerebbe qualunque asserzione su un caso solo.
   */
  it("la taglia esce dal seme, e la richiesta non può cambiarla", async () => {
    const sizes = new Set<number>();
    for (const seed of [1, 11, 42, 99, 123, 2026]) {
      const response = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, P2], seed });
      const { cubs } = response.json<{ cubs: unknown[] }>();
      expect(cubs.length).toBeGreaterThanOrEqual(1);
      expect(cubs.length).toBeLessThanOrEqual(10);
      sizes.add(cubs.length);
    }
    expect(sizes.size).toBeGreaterThan(1);

    // e una `litterSize` nel corpo non è una manopola: è rumore ignorato
    const forced = await post("/v1/gosini/litters", tokenA, {
      parentIds: [P1, P2],
      seed: 42,
      litterSize: 2,
    });
    expect(forced.json<{ cubs: unknown[] }>().cubs).toHaveLength(6);
  });

  it("il prezzo si vede prima dei nomi, e per i figli dei capostipiti è zero", async () => {
    const cari = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, P2], seed: 42 });
    const { cubs, generation, costUsd } = cari.json<{
      cubs: { viable: boolean }[];
      generation: number;
      costUsd: number;
    }>();
    expect(generation).toBe(4);
    expect(costUsd).toBeCloseTo(0.25 * cubs.filter((c) => c.viable).length, 6);

    const gratis = await post("/v1/gosini/litters", tokenA, { parentIds: [K1, K2], seed: 42 });
    const free = gratis.json<{ generation: number; costUsd: number }>();
    expect(free.generation).toBe(1);
    expect(free.costUsd).toBe(0);
  });
});

describe("POST /v1/gosini/births", () => {
  /**
   * ADR-103: **nascono tutti**. Prima ne nasceva uno e cinque fratelli visti
   * in anteprima sparivano senza essere mai esistiti; la scelta adesso è a
   * posteriori, guardando crescere chi c'è.
   */
  it("fa nascere l'intera cucciolata: un nome per cucciolo, lignaggio per ognuno", async () => {
    const preview = await post("/v1/gosini/litters", tokenA, { parentIds: [P1, P2], seed: 42 });
    const cubs = preview.json<{ cubs: { viable: boolean; traits: Record<string, number> }[] }>()
      .cubs;
    const names = cubs.map((_, at) => `Nino ${String(at + 1)}`);

    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [P1, P2],
      seed: 42,
      names,
    });
    expect(response.statusCode).toBe(201);
    const litter = response.json<{
      generation: number;
      costUsd: number;
      born: { id: string; name: string }[];
      stillborn: { index: number }[];
    }>();
    // Ciarla is generation 3: the child counts from the eldest parent
    expect(litter.generation).toBe(4);
    expect(litter.born.length + litter.stillborn.length).toBe(cubs.length);
    expect(litter.born.length).toBe(cubs.filter((cub) => cub.viable).length);

    for (const cub of litter.born) {
      const [row] = await db.select().from(gosini).where(eq(gosini.id, cub.id));
      expect(row?.parentGosinoId).toBe(P1);
      expect(row?.generation).toBe(4);
      expect(row?.origin).toBe("nato");
      const lineage = await db.select().from(births).where(eq(births.childGosinoId, cub.id));
      expect(lineage.map((r) => r.parentGosinoId).sort()).toEqual([P1, P2]);
    }

    // e il primo nato è il primo cucciolo dell'anteprima: il seme ha mantenuto
    // la promessa, nomi compresi (stesso ordine)
    const first = litter.born[0];
    const [genome] = await db
      .select()
      .from(traitSets)
      .where(eq(traitSets.gosinoId, first?.id ?? ""));
    expect(genome?.version).toBe(1);
    expect(genome?.mutationNote).toContain("seed=42");
    const stored = genome?.traits as { ceppo: number; alleles: Record<string, unknown> };
    expect(stored.alleles).toBeDefined();
    expect(stored.ceppo).toBeGreaterThanOrEqual(0);
    for (const [key, value] of Object.entries(cubs[0]?.traits ?? {})) {
      expect((stored as unknown as Record<string, number>)[key]).toBeCloseTo(value, 10);
    }
  });

  it("con un nome di meno non nasce nessuno, e dice quanti ne aspettava", async () => {
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [R1, R2],
      seed: 42,
      names: ["Solo", "Uno"],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ expected: number }>().expected).toBe(6);
  });

  it("refuses to give birth when the screen rejected every cub", async () => {
    // seed 7 su questa coppia è la nidiata singola, e quell'uno è spento
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [S1, S2],
      seed: 7,
      names: ["Spento"],
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: string }>().error).toBe("nessun cucciolo vitale");
  });

  it("wants a room that exists, like the manual birth", async () => {
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [R1, R2],
      seed: 42,
      names: Array.from({ length: 6 }, (_, at) => `Senzatetto ${String(at)}`),
      locationLabel: "garage",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("stanza sconosciuta");
  });

  it("keeps the neighbour out of the delivery room", async () => {
    const response = await post("/v1/gosini/births", tokenB, {
      parentIds: [P1, P2],
      seed: 42,
      names: ["Intruso"],
    });
    expect(response.statusCode).toBe(404);
  });

  /**
   * ADR-103 — il riposo. Trenta giorni fra due cucciolate della stessa coppia:
   * è il freno che impedisce a una casa di stampare un branco in un pomeriggio.
   */
  it("la stessa coppia non ne fa un'altra per un mese, e lo dice guardando", async () => {
    const names = Array.from({ length: 5 }, (_, at) => `Primo ${String(at)}`);
    const prima = await post("/v1/gosini/births", tokenA, {
      parentIds: [T1, T2],
      seed: 11,
      names,
    });
    expect(prima.statusCode).toBe(201);

    // la seconda nascita è rifiutata...
    const ancora = await post("/v1/gosini/births", tokenA, {
      parentIds: [T1, T2],
      seed: 42,
      names: Array.from({ length: 6 }, (_, at) => `Secondo ${String(at)}`),
    });
    expect(ancora.statusCode).toBe(409);
    const refusal = ancora.json<{ error: string; freeFrom: string }>();
    expect(refusal.error).toBe("coppia a riposo");
    expect(new Date(refusal.freeFrom).getTime()).toBeGreaterThan(Date.now());

    // ...e l'anteprima pure, perché mostrare sei cuccioli e poi rifiutarli
    // sarebbe il modo peggiore di dire di no
    const guardare = await post("/v1/gosini/litters", tokenA, { parentIds: [T1, T2], seed: 42 });
    expect(guardare.statusCode).toBe(409);
  });

  it("il riposo è della coppia, non del singolo: con un altro si può", async () => {
    const altra = await post("/v1/gosini/litters", tokenA, { parentIds: [T1, T3], seed: 11 });
    expect(altra.statusCode).toBe(200);
  });

  /**
   * ADR-103 — il conto.
   *
   * «Persino noi dobbiamo consumare crediti per le terze o successive
   * generazioni»: l'allevamento fondatore non ha lo sconto, e i figli di un
   * capostipite non si pagano.
   */
  it("i figli dei capostipiti non costano niente, e non lasciano righe", async () => {
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [K1, K2],
      seed: 99,
      names: ["Caino", "Abele", "Set"],
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ generation: number; costUsd: number }>().costUsd).toBe(0);

    const rows = await db
      .select()
      .from(budgetLedger)
      .where(and(eq(budgetLedger.accountId, houseA), eq(budgetLedger.gosinoId, K1)));
    expect(rows).toHaveLength(0);
  });

  it("dalla terza generazione la nascita si paga, e la quota è di ogni genitore", async () => {
    const response = await post("/v1/gosini/births", tokenA, {
      parentIds: [M1, M2],
      seed: 99,
      names: ["Cara", "Carissima", "Salata"],
    });
    expect(response.statusCode).toBe(201);
    const litter = response.json<{ costUsd: number; born: unknown[] }>();
    expect(litter.costUsd).toBeCloseTo(0.25 * litter.born.length, 6);

    const rows = await db
      .select()
      .from(budgetLedger)
      .where(eq(budgetLedger.accountId, houseA));
    const mine = rows.filter((row) => row.gosinoId === M1 || row.gosinoId === M2);
    expect(mine).toHaveLength(2);
    // nessun token, nessun fornitore: è una spesa di casa, e il ledger lo dice
    expect(mine.every((row) => row.provider === "ugo")).toBe(true);
    expect(mine.every((row) => row.model === "cucciolata-g4")).toBe(true);
    expect(mine.every((row) => row.tokensIn === 0 && row.tokensOut === 0)).toBe(true);
    const paid = mine.reduce((total, row) => total + Number(row.costUsd), 0);
    expect(paid).toBeCloseTo(litter.costUsd, 6);
  });

  it("col metabolismo acceso e il salvadanaio vuoto non nasce nessuno", async () => {
    const before = await db.select({ id: gosini.id }).from(gosini).where(eq(gosini.accountId, houseC));
    const response = await post("/v1/gosini/births", tokenC, {
      parentIds: [C1, C2],
      seed: 99,
      names: ["Nessuno", "Manco", "Uno"],
    });
    expect(response.statusCode).toBe(402);
    const refusal = response.json<{ error: string; parents: { name: string }[] }>();
    expect(refusal.error).toBe("salvadanaio insufficiente");
    expect(refusal.parents.map((p) => p.name).sort()).toEqual(["Spiantata", "Spiantato"]);

    // e il rifiuto è intero: nessun cucciolo scritto a metà
    const after = await db.select({ id: gosini.id }).from(gosini).where(eq(gosini.accountId, houseC));
    expect(after).toHaveLength(before.length);
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
      parentIds: [F1, F2],
      seed: 99,
      names: ["Firmato", "Controfirmato", "Vidimato"],
    });
    const childId = born.json<{ born: { id: string }[] }>().born[0]?.id ?? "";

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
    expect(tree.map((node) => node.id).sort()).toEqual([childId, F1, F2].sort());
    expect(tree.find((node) => node.id === F1)?.parents).toEqual([]);
  });

  it("una manomissione del genoma rende l'atto invalid: è il punto della firma", async () => {
    const born = await post("/v1/gosini/births", tokenA, {
      parentIds: [X1, X2],
      seed: 123,
      names: Array.from({ length: 7 }, (_, at) => `Manomesso ${String(at)}`),
    });
    const childId = born.json<{ born: { id: string }[] }>().born[0]?.id ?? "";

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

/**
 * Il genoma riletto (ADR-105). La cosa che questa vista aggiunge non è
 * «mostra i numeri»: è **quello che una creatura porta e non mostra**, cioè
 * la spiegazione di come da due genitori senza chiazze nasca un cucciolo a
 * chiazze. Se un giorno smettesse di uscire, l'allevamento tornerebbe a essere
 * una scatola nera.
 */
describe("GET /v1/gosini/:id/genome", () => {
  const genomeOf = (id: string, token: string) =>
    app.inject({
      method: "GET",
      url: `/v1/gosini/${id}/genome`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("rilegge il genoma di un fondatore: alleli, espressione, ceppo e versione", async () => {
    const response = await genomeOf(P1, tokenA);
    expect(response.statusCode).toBe(200);
    const body = response.json<GenomeShape>();
    expect(body.gosino.name).toBe("Placida");
    expect(body.version).toBe(1);
    expect(body.versions).toBe(1);
    expect(body.ceppo).toBeGreaterThanOrEqual(0);
    // ogni gene del catalogo c'è, coi suoi due alleli e come si esprime
    // 15 da ADR-109 (le setole). Il numero è scritto a mano apposta: un gene
    // che compare senza che nessuno se ne accorga è precisamente il modo in cui
    // il lettore dei genomi è rimasto tutto-o-niente per tre ADR di fila.
    expect(body.genes).toHaveLength(15);
    const calm = body.genes.find((gene) => gene.key === "calm");
    expect(calm?.alleles).toHaveLength(2);
    expect(calm?.expressed).toBeCloseTo(0.9, 5);
    // un fondatore è omozigote: non porta niente di nascosto
    expect(body.genes.every((gene) => gene.hidden === undefined)).toBe(true);
  });

  it("su un nato dice cosa porta senza mostrarlo, e da quale cucciolata viene", async () => {
    const born = await post("/v1/gosini/births", tokenA, {
      parentIds: [Y1, Y2],
      seed: 2026,
      names: Array.from({ length: 5 }, (_, at) => `Portatore ${String(at)}`),
    });
    expect(born.statusCode).toBe(201);
    const child = born.json<{ born: { id: string }[] }>().born[0];

    const response = await genomeOf(child?.id ?? "", tokenA);
    expect(response.statusCode).toBe(200);
    const body = response.json<GenomeShape>();
    // la provenienza è scritta: da quale cucciolata e quale cucciolo
    expect(body.note).toContain("seed=2026");
    // e i geni recessivi/dominanti dicono cosa c'è sotto, quando c'è
    const carried = body.genes.filter((gene) => gene.hidden !== undefined);
    for (const gene of carried) {
      expect(["recessive", "dominant"]).toContain(gene.expression);
      expect(gene.hidden).not.toBeCloseTo(gene.expressed, 3);
    }
  });

  it("il genoma del vicino non esiste, come la creatura", async () => {
    const response = await genomeOf(P1, tokenB);
    expect(response.statusCode).toBe(404);
  });
});

interface GenomeShape {
  gosino: { id: string; name: string; generation: number };
  ceppo: number;
  version: number;
  versions: number;
  note?: string;
  genes: {
    key: string;
    expression: string;
    alleles: number[];
    expressed: number;
    hidden?: number;
  }[];
}
