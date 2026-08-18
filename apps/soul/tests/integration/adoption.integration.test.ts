import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  adoptions,
  createDbClient,
  type DbClient,
  gosini,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { generateGosinoKeys, holderHash, verifyChain, type ChainEntry } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRegistry } from "registry/server";
import { ChainStore } from "registry/store";
import {
  createHousehold,
  createHouseholdWithFounder,
} from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * L'adozione (ADR-084) **contro un registro vero**.
 *
 * Questo test esiste per la ragione di ADR-045: i due lati possono restare
 * verdi separatamente mentre la giunzione è rotta. Il libro genealogico ha i
 * suoi test e l'anima ha i suoi, e nessuno dei due ha mai provato che
 * l'anima **parli davvero** col registro — cioè che la forma dell'atto che
 * pubblica sia quella che il registro accetta.
 *
 * Qui girano tutti e due, veri, su due Postgres diversi: si prenota dalla
 * vetrina senza token, si paga, si consegna, e poi si **cammina la catena**
 * col modulo condiviso — che è il controllo che farebbe un compratore.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);
const REGISTRAR = generateGosinoKeys();
const REGISTRY_TOKEN = "token-del-registrar";

let pgSoul: StartedPostgreSqlContainer;
let pgChain: StartedPostgreSqlContainer;
let db: DbClient;
let chainSql: ReturnType<typeof postgres>;
let app: FastifyInstance;
let registry: FastifyInstance;
let store: ChainStore;
let allevamento: string;
let allevamentoId: string;
let cucciolo: string;
let padre: string;
let madre: string;

const post = (url: string, body: unknown, token?: string) =>
  app.inject({
    method: "POST",
    url,
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  const [soulPg, chainPg] = await Promise.all([startPostgres(), startPostgres()]);
  pgSoul = soulPg.container;
  pgChain = chainPg.container;
  await runMigrations(soulPg.url);
  db = createDbClient(soulPg.url);

  // il registro: database suo, come in produzione (ADR-073)
  chainSql = postgres(chainPg.url, { max: 4 });
  store = new ChainStore(chainSql, REGISTRAR.signingPrivateKey);
  await store.migrate();
  registry = buildRegistry({
    store,
    token: REGISTRY_TOKEN,
    registrarPublicKey: REGISTRAR.signingPublicKey,
    registrarName: "prova",
    logger: false,
  });
  await registry.listen({ port: 0, host: "127.0.0.1" });
  const address = registry.server.address() as AddressInfo;

  const kennel = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "allevamento",
    name: "Allevamento",
    gosinoName: "Zero",
    breeder: true,
  });
  allevamento = kennel.ownerToken;
  allevamentoId = kennel.householdId;

  // due genitori con genomi abbastanza diversi da poter avere cuccioli
  const seedParent = async (name: string, traits: Record<string, number>): Promise<string> => {
    const [row] = await db
      .insert(gosini)
      .values({ householdId: allevamentoId, name, origin: "capostipite" })
      .returning({ id: gosini.id });
    if (row === undefined) throw new Error("no parent");
    await db.insert(traitSets).values({
      householdId: allevamentoId,
      gosinoId: row.id,
      version: 1,
      traits,
    });
    return row.id;
  };
  padre = await seedParent("Padre", { calm: 0.2, curiosity: 0.8, boldness: 0.7, affection: 0.3 });
  madre = await seedParent("Madre", { calm: 0.8, curiosity: 0.3, boldness: 0.2, affection: 0.9 });

  const [born] = await db
    .insert(gosini)
    .values({
      householdId: allevamentoId,
      name: "Nino",
      origin: "nato",
      generation: 1,
      mortalFrom: new Date(),
      lifeJitterDays: 0,
    })
    .returning({ id: gosini.id });
  if (born === undefined) throw new Error("no cub");
  cucciolo = born.id;
  await db.insert(traitSets).values({
    householdId: allevamentoId,
    gosinoId: cucciolo,
    version: 1,
    traits: { calm: 0.5, spots: 0.9 },
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    createHouse: async (input) =>
      createHousehold(db, MASTER_KEY, {
        slug: input.slug,
        name: input.name,
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      }).then((house) => ({
        householdId: house.householdId,
        slug: house.slug,
        persona: house.persona,
        ownerToken: house.ownerToken,
        tokenId: house.tokenId,
      })),
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: {
        dataKey: DATA_KEY,
        // il ponte vero: l'indirizzo del registro che sta girando qui accanto
        chain: { baseUrl: `http://127.0.0.1:${String(address.port)}`, token: REGISTRY_TOKEN },
      },
    },
  });
  await app.ready();
}, 300_000);

afterAll(async () => {
  await app.close();
  await registry.close();
  await db.$client.end();
  await chainSql.end();
  await Promise.all([pgSoul.stop(), pgChain.stop()]);
});

let adozione: string;
let casaCompratore: string;

describe("la nascita arriva al registro davvero", () => {
  /**
   * La metà della giunzione che nessuno aveva mai provato: la rotta della
   * nascita costruisce un atto, lo firma con le chiavi dei genitori e lo
   * presenta. Se la forma non fosse quella che il registro accetta, nessun
   * gosino sarebbe mai registrato — e nessuno potrebbe mai essere venduto,
   * perché senza atto di nascita non si cede (ADR-082).
   */
  it("una cucciolata adottata finisce in catena, firmata dai genitori", async () => {
    const litter = await post(
      "/v1/gosini/litters",
      { parentIds: [padre, madre], seed: 42 },
      allevamento,
    );
    expect(litter.statusCode).toBe(200);

    const birth = await post(
      "/v1/gosini/births",
      { parentIds: [padre, madre], seed: 42, cubIndex: 0, name: "Cucciolo" },
      allevamento,
    );
    expect(birth.statusCode).toBe(201);
    const nato = birth.json<{ id: string }>().id;

    const entries = await store.actsFor(nato);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.act.kind).toBe("birth");
    // le firme dei genitori sono NELL'ATTO: il registro le ha verificate, e
    // chiunque può rifarlo senza di noi
    expect(entries[0]?.act.parents).toHaveLength(2);
  });
});

describe("dalla vetrina alla casa, col registro acceso", () => {
  it("l'allevamento lo mette in vetrina, col prezzo", async () => {
    const response = await post(
      `/v1/gosini/${cucciolo}/vetrina`,
      { listed: true, priceCents: 24_000 },
      allevamento,
    );
    expect(response.statusCode).toBe(200);
    const vetrina = await app.inject({ method: "GET", url: "/v1/vetrina" });
    const cubs = vetrina.json<{ allevamenti: { cubs: { priceCents: number }[] }[] }>().allevamenti;
    expect(cubs[0]?.cubs[0]?.priceCents).toBe(24_000);
  });

  it("si prenota SENZA token: chi sceglie non ha ancora una casa", async () => {
    const response = await post(`/v1/vetrina/${cucciolo}/prenota`, {
      casa: { slug: "rossi", nome: "Famiglia Rossi" },
    });
    expect(response.statusCode).toBe(201);
    const booked = response.json<{
      adozione: string;
      token: string;
      casa: string;
      prezzo: { centesimi: number };
    }>();
    expect(booked.prezzo.centesimi).toBe(24_000);
    expect(booked.token).not.toBe("");
    adozione = booked.adozione;
    casaCompratore = booked.casa;
  });

  it("e da quel momento non è più in vetrina: due famiglie non credono di averlo", async () => {
    const vetrina = await app.inject({ method: "GET", url: "/v1/vetrina" });
    expect(vetrina.json<{ allevamenti: unknown[] }>().allevamenti).toEqual([]);
    // e nessun altro può prenotarlo
    const secondo = await post(`/v1/vetrina/${cucciolo}/prenota`, {
      casa: { slug: "bianchi", nome: "Bianchi" },
    });
    expect(secondo.statusCode).toBe(404);
  });

  it("non si consegna quello che non è stato pagato", async () => {
    const response = await post(`/v1/adozioni/${adozione}/consegna`, {}, allevamento);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ detail: string }>().detail).toContain("è stato pagato");
  });

  it("pagata, e poi consegnata — con l'atto in catena", async () => {
    // Nino è stato seminato a mano nel database, quindi il registro non l'ha
    // mai visto nascere: gli si mette l'atto adesso, che è quello che avrebbe
    // avuto nascendo dalla rotta
    await store.append({
      kind: "birth",
      gosinoId: cucciolo,
      genomeHash: "0".repeat(64),
      at: new Date().toISOString(),
      generation: 1,
    });
    expect(
      (await post(`/v1/adozioni/${adozione}/pagamento`, { riferimento: "bonifico 12/8" }, allevamento))
        .statusCode,
    ).toBe(200);

    const response = await post(`/v1/adozioni/${adozione}/consegna`, {}, allevamento);
    expect(response.statusCode).toBe(200);
    const done = response.json<{ chainSeq: number | null }>();
    // **il numero della voce in catena**: se è null, l'anima non ha parlato
    // col registro — ed è precisamente il difetto che questo test cerca
    expect(done.chainSeq).not.toBeNull();

    const [row] = await db.select().from(adoptions).where(eq(adoptions.id, adozione));
    expect(row?.status).toBe("consegnata");
    expect(row?.chainSeq).toBe(done.chainSeq);

    const [moved] = await db
      .select({ house: gosini.householdId })
      .from(gosini)
      .where(eq(gosini.id, cucciolo));
    expect(moved?.house).toBe(casaCompratore);
  });
});

describe("e la catena regge, camminata da fuori", () => {
  it("l'atto di cessione c'è, e dice da chi a chi — in forma opaca", async () => {
    const entries = await store.actsFor(cucciolo);
    const transfer = entries.find((entry) => entry.act.kind === "transfer");
    expect(transfer).toBeDefined();
    expect(transfer?.act.fromHash).toBe(holderHash(allevamentoId));
    expect(transfer?.act.toHash).toBe(holderHash(casaCompratore));
    // nessun nome, nessuna persona, nessun prezzo: la catena porta la custodia
    expect(JSON.stringify(transfer?.act)).not.toContain("Rossi");
    expect(JSON.stringify(transfer?.act)).not.toContain("24000");
  });

  it("la catena si verifica col modulo condiviso, senza il codice del registro", async () => {
    const walked: ChainEntry[] = await store.entries(1, 100);
    expect(walked.length).toBeGreaterThanOrEqual(2);
    expect(verifyChain(walked, REGISTRAR.signingPublicKey)).toEqual([]);
  });

  it("la doppia vendita la rifiuta il registro, non noi", async () => {
    // l'allevamento non ha più il cucciolo, quindi la cessione fallisce prima;
    // ma anche l'atto, presentato a mano, viene rifiutato: la custodia non è
    // più sua, e questo è il controllo che nessun server può aggirare
    const address = registry.server.address() as AddressInfo;
    const response = await fetch(new URL("/acts", `http://127.0.0.1:${String(address.port)}`), {
      method: "POST",
      headers: {
        authorization: `Bearer ${REGISTRY_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "transfer",
        gosinoId: cucciolo,
        genomeHash: "0".repeat(64),
        at: new Date().toISOString(),
        fromHash: holderHash(allevamentoId),
        toHash: holderHash("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      }),
    });
    expect(response.status).toBe(409);
  });
});
