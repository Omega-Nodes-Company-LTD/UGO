import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, memories, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { MemoryBook } from "../../src/services/memoryBook.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";

/**
 * Il libro dei ricordi (ADR-086) su database vero.
 *
 * Due cose che solo un database può dire:
 *
 * 1. che i mesi si contino davvero, e che un mese vuoto **non sia una riga a
 *    zero** — la costa del libro è fatta di capitoli, non di silenzi contati;
 * 2. che il **lascito cifrato si legga**. È il difetto che questo lavoro ha
 *    trovato: il lascito di chi se n'è andato (ADR-075) e le lezioni
 *    dell'anziano (ADR-077) sono scritti cifrati, e il pannello li stampava
 *    grezzi — cioè mostrava `v1:` e base64 al posto della cosa più preziosa
 *    che resti di una creatura.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let token: string;
let who: string;
let houseId: string;
let book: MemoryBook;
let voice: ChatService;

const MARZO = new Date("2026-03-14T10:00:00.000Z");
const AGOSTO = new Date("2026-08-02T10:00:00.000Z");

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-libro",
    name: "Libro",
    gosinoName: "Ugo",
  });
  token = house.ownerToken;
  who = house.gosinoId;
  houseId = house.accountId;
  book = new MemoryBook(db, DATA_KEY);

  await db.insert(memories).values([
    // marzo: uno in chiaro come li scrive il sogno...
    {
      gosinoId: who,
      kind: "fact",
      text: "Il corriere passa il martedì",
      importance: 0.8,
      createdAt: MARZO,
    },
    // ...e uno cifrato, come li scrive il congedo
    {
      gosinoId: who,
      kind: "insight",
      text: encryptText("Le viti M3 con inserto a caldo tengono meglio", DATA_KEY),
      importance: 0.9,
      sourceRefs: { legacy: true },
      createdAt: MARZO,
    },
    {
      gosinoId: who,
      kind: "preference",
      text: "Gli piace il caffè lungo",
      importance: 0.6,
      createdAt: AGOSTO,
    },
  ]);

  voice = new ChatService({
    db,
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: {
      chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
    },
    psyche: await PsycheService.restore(db, new Date(), who),
    dataKey: DATA_KEY,
    timezone: "Europe/Rome",
    locale: "it-IT",
    gosinoId: who,
    accountId: houseId,
    character: characterFrom({}),
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

describe("la costa del libro", () => {
  it("i mesi che hanno qualcosa dentro, dal più recente", async () => {
    const spine = await book.spine(houseId, who);
    expect(spine.map((m) => m.month)).toEqual(["2026-08", "2026-03"]);
    expect(spine[1]?.count).toBe(2);
  });

  it("i mesi vuoti non ci sono: un silenzio non è un capitolo", async () => {
    const spine = await book.spine(houseId, who);
    // fra marzo e agosto ce ne sono quattro, e nessuno compare a zero
    expect(spine.map((m) => m.month)).not.toContain("2026-05");
  });
});

describe("la pagina del mese", () => {
  it("legge il lascito cifrato insieme a quello in chiaro", async () => {
    const page = await book.page(houseId, who, "2026-03");
    expect(page).toHaveLength(2);
    const texts = page.map((row) => row.text);
    expect(texts).toContain("Il corriere passa il martedì");
    // è il punto: senza questo, qui ci sarebbe «v1:» e del base64
    expect(texts.join(" ")).toContain("viti M3");
    expect(texts.join(" ")).not.toContain("v1:");
  });

  it("un anno intero è la stessa domanda con una grana più grossa", async () => {
    const year = await book.page(houseId, who, "2026");
    expect(year).toHaveLength(3);
    // in ordine di come è successo: un libro si legge in avanti
    expect(year[0]?.createdAt.getTime()).toBeLessThan(year[2]?.createdAt.getTime() ?? 0);
  });
});

describe("dalla rotta", () => {
  it("senza periodo dà la costa, col periodo dà la pagina", async () => {
    const spine = await app.inject({
      method: "GET",
      url: "/v1/memories/book",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(spine.statusCode).toBe(200);
    expect(spine.json<{ months: { month: string }[] }>().months).toHaveLength(2);

    const page = await app.inject({
      method: "GET",
      url: "/v1/memories/book?periodo=2026-03",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(page.statusCode).toBe(200);
    expect(page.json<{ memories: unknown[] }>().memories).toHaveLength(2);
  });

  it("un periodo che non è un periodo si rifiuta", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/memories/book?periodo=marzo",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("e l'elenco di sempre adesso mostra il lascito, non il base64", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/memories",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ memories: { text: string }[] }>();
    expect(body.memories.map((m) => m.text).join(" ")).toContain("viti M3");
    expect(body.memories.map((m) => m.text).join(" ")).not.toContain("v1:");
  });
});

describe("a voce", () => {
  it("«cosa ti ricordi di marzo?» risponde senza chiamare nessuno", async () => {
    const said = await voice.handle({ channel: "home", text: "cosa ti ricordi di marzo?" });
    expect(said.reply).toContain("marzo 2026");
    expect(said.reply).toContain("corriere");
    expect(said.reply).toContain("viti M3");
  });

  it("di un mese in cui non è successo niente lo dice", async () => {
    const said = await voice.handle({ channel: "home", text: "cosa ti ricordi di maggio?" });
    expect(said.reply).toContain("maggio 2026");
    expect(said.reply).toContain("non mi viene in mente");
  });
});
