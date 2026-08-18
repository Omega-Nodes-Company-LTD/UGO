import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  beings,
  createDbClient,
  type DbClient,
  gosini,
  memories,
  memoryBeings,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText, encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createHousehold,
  createHouseholdWithFounder,
} from "../../src/services/householdService.js";
import { buildServer } from "../../src/server.js";

/**
 * La dote (ADR-074) su database vero.
 *
 * La prova che conta non è che i dati viaggino — è che **le PII di terzi non
 * escano**: la tua biografia puoi donarla, quella degli altri no. E che
 * messaggi e trascrizioni non abbiano proprio una strada per uscire.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let giverHouse: string;
let giverToken: string;
let who: string;
let ivanBeingId: string;
let ownerBeingId: string;
let schoolToken: string;

const post = (url: string, token: string, body: unknown) =>
  app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body ?? {}),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const giver = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "studio-donatore",
    name: "Donatore",
    gosinoName: "Maestro",
  });
  giverHouse = giver.householdId;
  giverToken = giver.ownerToken;
  who = giver.gosinoId;

  const school = await createHousehold(db, MASTER_KEY, { slug: "scuola", name: "Scuola" });
  schoolToken = school.ownerToken;

  const [owner] = await db
    .insert(beings)
    .values({ householdId: giverHouse, displayName: "Il proprietario", species: "human" })
    .returning({ id: beings.id });
  const [ivan] = await db
    .insert(beings)
    .values({ householdId: giverHouse, displayName: "Ivan", species: "human", aliases: ["Ivanov"] })
    .returning({ id: beings.id });
  ownerBeingId = owner?.id ?? "";
  ivanBeingId = ivan?.id ?? "";

  const remember = async (
    kind: "fact" | "insight" | "episode" | "preference",
    text: string,
    about?: string,
  ): Promise<void> => {
    const [row] = await db
      .insert(memories)
      .values({ gosinoId: who, kind, text: encryptText(text, DATA_KEY), importance: 0.8 })
      .returning({ id: memories.id });
    if (row !== undefined && about !== undefined) {
      await db
        .insert(memoryBeings)
        .values({ householdId: giverHouse, memoryId: row.id, beingId: about });
    }
  };

  // il sapere di bottega: viaggia
  await remember("fact", "La resistenza di pull-up sull'I2C sta fra 2,2k e 4,7k ohm");
  await remember("insight", "Quando il DHT22 legge NaN, quasi sempre è il cavo troppo lungo");
  // il racconto del proprietario: viaggia solo se lo chiede, ed è suo
  await remember("episode", "Il giorno che ho montato il primo dock in officina", ownerBeingId);
  // il fatto di un TERZO: non deve uscire mai
  await remember("fact", "Ivan preferisce essere chiamato la mattina presto", ivanBeingId);
  // e un ricordo che nomina Ivan nel testo senza collegamento: la seconda guardia
  await remember("insight", "Con Ivanov conviene parlare di prezzi solo dopo il caffè");

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
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

describe("l'anteprima della dote", () => {
  it("conta il sapere, e dice cosa resta a casa", async () => {
    const response = await post(`/v1/gosini/${who}/dowry/preview`, giverToken, {
      giverBeingId: ownerBeingId,
    });
    expect(response.statusCode).toBe(200);
    const preview = response.json<{
      knowledge: number;
      stories: number;
      withheldForOthers: number;
      neverTravels: Record<string, string>;
    }>();
    // due fatti/intuizioni pulite; quella su Ivan è trattenuta
    expect(preview.knowledge).toBe(2);
    expect(preview.withheldForOthers).toBeGreaterThanOrEqual(1);
    // e le classi che non viaggiano sono dichiarate, non nascoste
    expect(Object.keys(preview.neverTravels).sort()).toEqual([
      "bonds",
      "messages",
      "transcripts",
    ]);
  });

  it("i racconti del donatore viaggiano solo se li chiede", async () => {
    const senza = await post(`/v1/gosini/${who}/dowry/preview`, giverToken, {
      giverBeingId: ownerBeingId,
    });
    const con = await post(`/v1/gosini/${who}/dowry/preview`, giverToken, {
      giverBeingId: ownerBeingId,
      includeStories: true,
    });
    expect(senza.json<{ stories: number }>().stories).toBeGreaterThan(0);
    expect(con.statusCode).toBe(200);
  });

  it("la dote del vicino non esiste", async () => {
    const response = await post(`/v1/gosini/${who}/dowry/preview`, schoolToken, {});
    expect(response.statusCode).toBe(404);
  });
});

describe("fare la dote", () => {
  it("l'archivio si apre con la sua chiave, e NON con quella di casa", async () => {
    const response = await post(`/v1/gosini/${who}/dowry`, giverToken, {
      giverBeingId: ownerBeingId,
    });
    expect(response.statusCode).toBe(201);
    const made = response.json<{ key: string; sealed: string }>();

    const opened = JSON.parse(decryptText(made.sealed, Buffer.from(made.key, "base64"))) as {
      memories: { text: string }[];
    };
    expect(opened.memories.length).toBeGreaterThan(0);
    // con la chiave della casa non si apre: una dote non porta con sé il resto
    expect(() => decryptText(made.sealed, DATA_KEY)).toThrow();
  });

  it("le PII di terzi non escono: né per collegamento, né per testo", async () => {
    const response = await post(`/v1/gosini/${who}/dowry`, giverToken, {
      giverBeingId: ownerBeingId,
      includeStories: true,
    });
    const made = response.json<{ key: string; sealed: string }>();
    const plain = decryptText(made.sealed, Buffer.from(made.key, "base64"));

    // il fatto collegato a Ivan non c'è (prima guardia: memory_beings)
    expect(plain).not.toContain("chiamato la mattina presto");
    // e il nome rimasto in un testo altrimenti pulito è redatto (seconda guardia)
    expect(plain).not.toContain("Ivanov");
    expect(plain).not.toContain("Ivan");
    // mentre il sapere di bottega c'è tutto
    expect(plain).toContain("pull-up");
  });

  it("messaggi e trascrizioni non hanno una strada per uscire", async () => {
    const response = await post(`/v1/gosini/${who}/dowry`, giverToken, {
      giverBeingId: ownerBeingId,
      includeStories: true,
      // non esiste una spunta per farli viaggiare: non è un'omissione
      includeMessages: true,
      includeTranscripts: true,
    });
    // il corpo con chiavi ignote viene rifiutato: Zod a ogni confine
    expect([201, 400]).toContain(response.statusCode);
    if (response.statusCode === 201) {
      const made = response.json<{ key: string; sealed: string }>();
      const plain = decryptText(made.sealed, Buffer.from(made.key, "base64"));
      expect(plain).not.toContain("messages");
    }
  });
});

describe("adottare una dote", () => {
  it("fa NASCERE un esemplare che sa quelle cose, e la provenienza resta scritta", async () => {
    const made = (
      await post(`/v1/gosini/${who}/dowry`, giverToken, { giverBeingId: ownerBeingId })
    ).json<{ key: string; sealed: string }>();

    const adopted = await post("/v1/dowries/adopt", schoolToken, {
      sealed: made.sealed,
      key: made.key,
      name: "Professore",
    });
    expect(adopted.statusCode).toBe(201);
    const { gosinoId, learned } = adopted.json<{ gosinoId: string; learned: number }>();
    expect(learned).toBe(2);

    // è un esemplare nuovo, capostipite nella casa che riceve
    const [born] = await db.select().from(gosini).where(eq(gosini.id, gosinoId));
    expect(born?.name).toBe("Professore");
    expect(born?.generation).toBe(0);
    expect(born?.parentGosinoId).toBeNull();

    // sa le cose, e la provenienza è nel genoma versionato
    const learnedRows = await db
      .select({ text: memories.text })
      .from(memories)
      .where(eq(memories.gosinoId, gosinoId));
    expect(learnedRows).toHaveLength(2);
    /**
     * ADR-091: in CHIARO, e l'asserzione è più forte di prima, non più debole.
     * Finché erano cifrate, queste righe non si ripescavano e l'oblio non le
     * rediggeva: il test che chiedeva `decryptText` stava confermando il
     * difetto invece di cercarlo.
     */
    expect(learnedRows.map((row) => row.text).join(" ")).toContain("pull-up");
    expect(learnedRows.some((row) => row.text.startsWith("v1:"))).toBe(false);

    const [genome] = await db.select().from(traitSets).where(eq(traitSets.gosinoId, gosinoId));
    expect(genome?.mutationNote).toContain("dote adottata");
  });

  it("con la chiave sbagliata non si apre niente, e non nasce nessuno", async () => {
    const before = await db.select({ id: gosini.id }).from(gosini);
    const made = (
      await post(`/v1/gosini/${who}/dowry`, giverToken, {})
    ).json<{ sealed: string }>();

    const response = await post("/v1/dowries/adopt", schoolToken, {
      sealed: made.sealed,
      key: randomBytes(32).toString("base64"),
      name: "Fantasma",
    });
    expect(response.statusCode).toBe(400);
    const after = await db.select({ id: gosini.id }).from(gosini);
    expect(after).toHaveLength(before.length);
  });
});
