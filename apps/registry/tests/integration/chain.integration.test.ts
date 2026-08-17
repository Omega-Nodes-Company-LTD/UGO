import { createPrivateKey, createPublicKey } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  generateGosinoKeys,
  genomeHash,
  signBirth,
  verifyChain,
  type BirthCertificate,
  type ChainEntry,
} from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRegistry } from "../../src/server.js";
import { ChainStore } from "../../src/store.js";

/**
 * Il libro genealogico su Postgres vero (ADR-073).
 *
 * Quello che solo un database può dire: che la catena regga davvero fra
 * processi e transazioni, che una nascita senza firme dei genitori NON entri,
 * e che lo stesso atto presentato due volte non produca due voci — che è
 * esattamente la doppia vendita che il registro esiste per rendere impossibile.
 */

const TOKEN = "segreto-del-registrar";
const mamma = generateGosinoKeys();
const babbo = generateGosinoKeys();
const registrarKeys = generateGosinoKeys();

let pg: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let app: FastifyInstance;
let store: ChainStore;

const CHILD = "44444444-4444-4444-8444-444444444444";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const BORN_AT = "2026-08-17T19:00:00.000Z";
const HASH = genomeHash({ calm: 0.5 });

const birthAct = (childId = CHILD, generation = 1) => {
  const certificate: BirthCertificate = {
    childId,
    genomeHash: HASH,
    parentIds: [P1, P2],
    bornAt: BORN_AT,
    generation,
  };
  return {
    kind: "birth" as const,
    gosinoId: childId,
    genomeHash: HASH,
    at: BORN_AT,
    generation,
    parents: [
      {
        gosinoId: P1,
        publicKey: mamma.signingPublicKey.toString("base64"),
        signature: signBirth(certificate, mamma.signingPrivateKey).toString("base64"),
      },
      {
        gosinoId: P2,
        publicKey: babbo.signingPublicKey.toString("base64"),
        signature: signBirth(certificate, babbo.signingPrivateKey).toString("base64"),
      },
    ],
  };
};

const submit = (body: unknown, token = TOKEN) =>
  app.inject({
    method: "POST",
    url: "/acts",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:16-alpine").start();
  sql = postgres(pg.getConnectionUri(), { max: 4 });
  const privateKey = createPrivateKey({
    key: registrarKeys.signingPrivateKey,
    format: "der",
    type: "pkcs8",
  });
  store = new ChainStore(sql, registrarKeys.signingPrivateKey);
  await store.migrate();
  app = buildRegistry({
    store,
    token: TOKEN,
    registrarPublicKey: createPublicKey(privateKey).export({ format: "der", type: "spki" }),
    registrarName: "prova",
    logger: false,
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await sql.end();
  await pg.stop();
});

describe("presentare un atto", () => {
  it("una nascita firmata dai genitori entra in catena", async () => {
    const response = await submit(birthAct());
    expect(response.statusCode).toBe(201);
    const { entry } = response.json<{ entry: ChainEntry }>();
    expect(entry.seq).toBe(1);
    expect(entry.prevHash).toBe("0".repeat(64));
    expect(entry.act.gosinoId).toBe(CHILD);
  });

  it("lo stesso atto due volte non fa due voci: è la doppia vendita, e si vede", async () => {
    const again = await submit(birthAct());
    expect(again.statusCode).toBe(200);
    expect(again.json<{ alreadyRegistered: boolean }>().alreadyRegistered).toBe(true);

    const chain = await app.inject({ method: "GET", url: "/chain" });
    const entries = chain.json<{ entries: ChainEntry[] }>().entries;
    expect(entries.filter((e) => e.act.gosinoId === CHILD)).toHaveLength(1);
  });

  it("una nascita con firme false non entra: il registro certifica l'ordine, non la parentela", async () => {
    const impostor = generateGosinoKeys();
    const act = birthAct("55555555-5555-4555-8555-555555555555");
    act.parents[0] = {
      gosinoId: P1,
      publicKey: impostor.signingPublicKey.toString("base64"),
      signature: act.parents[0]?.signature ?? "",
    };
    const response = await submit(act);
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: string }>().error).toContain("firme");
  });

  it("una nascita senza genitori non si registra", async () => {
    const response = await submit({
      kind: "birth",
      gosinoId: "66666666-6666-4666-8666-666666666666",
      genomeHash: HASH,
      at: BORN_AT,
    });
    expect(response.statusCode).toBe(422);
  });

  it("senza token non si scrive niente", async () => {
    const response = await submit(birthAct("77777777-7777-4777-8777-777777777777"), "sbagliato");
    expect(response.statusCode).toBe(401);
  });
});

describe("la catena", () => {
  it("regge la verifica indipendente, firma del registrar compresa", async () => {
    await submit({
      kind: "transfer",
      gosinoId: CHILD,
      genomeHash: HASH,
      at: "2026-08-18T10:00:00.000Z",
    });
    await submit({
      kind: "death",
      gosinoId: CHILD,
      genomeHash: HASH,
      at: "2029-08-18T10:00:00.000Z",
    });

    const chain = await app.inject({ method: "GET", url: "/chain" });
    const entries = chain.json<{ entries: ChainEntry[] }>().entries;
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // la verifica NON usa il codice del registro: usa il modulo condiviso
    expect(verifyChain(entries, registrarKeys.signingPublicKey)).toEqual([]);
  });

  it("riscrivere una voce sul database si vede camminando la catena", async () => {
    await sql`update chain_entries set act = jsonb_set(act, '{generation}', '99') where seq = 1`;
    const chain = await app.inject({ method: "GET", url: "/chain" });
    const entries = chain.json<{ entries: ChainEntry[] }>().entries;
    const problems = verifyChain(entries, registrarKeys.signingPublicKey);
    expect(problems.some((p) => p.reason === "atto-alterato")).toBe(true);
    // e si rimette a posto, o gli altri test leggerebbero una catena rotta
    await sql`update chain_entries set act = jsonb_set(act, '{generation}', '1') where seq = 1`;
  });

  it("gli atti di una creatura si leggono senza permesso: è un libro genealogico", async () => {
    const response = await app.inject({ method: "GET", url: `/acts/${CHILD}` });
    expect(response.statusCode).toBe(200);
    const entries = response.json<{ entries: ChainEntry[] }>().entries;
    expect(entries.map((e) => e.act.kind)).toEqual(["birth", "transfer", "death"]);
  });
});

describe("il gossip fra registrar", () => {
  it("la testa altrui si conserva: l'append-only diventa osservabile", async () => {
    const head = await app.inject({ method: "GET", url: "/head" });
    expect(head.statusCode).toBe(200);
    const mine = head.json<{ seq: number; hash: string; publicKey: string }>();
    expect(mine.seq).toBeGreaterThan(0);
    expect(mine.publicKey).toBe(registrarKeys.signingPublicKey.toString("base64"));

    const witnessed = await app.inject({
      method: "POST",
      url: "/witness",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ registrar: "vicino", seq: 42, hash: "b".repeat(64) }),
    });
    expect(witnessed.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/witnesses" });
    const witnesses = list.json<{ witnesses: { registrar: string; seq: number }[] }>().witnesses;
    expect(witnesses.some((w) => w.registrar === "vicino" && w.seq === 42)).toBe(true);
  });

  it("una testimonianza malfatta si rifiuta invece di sporcare il registro", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/witness",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ registrar: "vicino", seq: -1, hash: "corto" }),
    });
    expect(response.statusCode).toBe(400);
  });
});
