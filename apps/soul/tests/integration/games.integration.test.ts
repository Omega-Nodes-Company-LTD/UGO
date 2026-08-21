import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, type DbClient, games, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { PsycheService } from "../../src/services/psycheService.js";

/**
 * Il gioco (ADR-112) sul giro vero.
 *
 * Le cose che solo un giro completo prova: che una partita esista come **riga**
 * e non come variabile di processo, che il numero sia cifrato dentro quella
 * riga, e che tutto il gioco non sfiori il provider — a rispondere «più alto»
 * è un confronto fra due interi, e il `budget_ledger` deve restare vuoto.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let houseId: string;
let who: string;
let chat: ChatService;

const say = (text: string) => chat.handle({ channel: "home", text });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-gioco",
    name: "Gioco",
    gosinoName: "Indovino",
  });
  houseId = house.accountId;
  who = house.gosinoId;

  chat = new ChatService({
    db,
    // se una mossa raggiungesse il provider, il test morirebbe
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: { chat: () => Promise.reject(new Error("il provider non deve essere chiamato")) },
    psyche: await PsycheService.restore(db, new Date(), who),
    dataKey: DATA_KEY,
    timezone: "Europe/Rome",
    locale: "it-IT",
    gosinoId: who,
    accountId: houseId,
    character: characterFrom({}),
  });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

const openGame = async (): Promise<{ id: string; secret: string; turns: number } | undefined> => {
  const [row] = await db
    .select({ id: games.id, secret: games.secret, turns: games.turns })
    .from(games)
    .where(eq(games.accountId, houseId));
  return row;
};

describe("«giochiamo?»", () => {
  it("la partita è una riga, e il numero ci sta dentro cifrato", async () => {
    const opened = await say("giochiamo?");
    expect(opened.reply).toMatch(/numero/u);

    const row = await openGame();
    expect(row, "la partita deve esistere sul database, non in un oggetto").toBeDefined();
    // il ciphertext non è il numero: chi legge il database non gioca in vantaggio
    expect(row?.secret).toMatch(/^v1:/u);
    const secret = Number.parseInt(decryptText(row?.secret ?? "", DATA_KEY), 10);
    expect(secret).toBeGreaterThanOrEqual(1);
    expect(secret).toBeLessThanOrEqual(100);
  });

  it("un tentativo sbagliato dice la direzione e NON il numero", async () => {
    const row = await openGame();
    const secret = Number.parseInt(decryptText(row?.secret ?? "", DATA_KEY), 10);
    const wrong = secret === 1 ? 2 : 1;
    const answer = await say(String(wrong));
    expect(answer.reply).toMatch(wrong < secret ? /più alto/u : /più basso/u);
    expect(answer.reply).not.toContain(String(secret));
  });

  it("indovinare chiude la partita, e non ne resta una aperta", async () => {
    const row = await openGame();
    const secret = Number.parseInt(decryptText(row?.secret ?? "", DATA_KEY), 10);
    const answer = await say(`dico ${String(secret)}`);
    expect(answer.reply).toMatch(/Preso/u);

    const [closed] = await db
      .select({ endedAt: games.endedAt, turns: games.turns })
      .from(games)
      .where(eq(games.accountId, houseId));
    expect(closed?.endedAt).not.toBeNull();
    expect(closed?.turns).toBeGreaterThan(0);
  });

  /**
   * Il punto di tutto: il gioco è deterministico e in casa. Se una sola mossa
   * fosse passata da un modello a pagamento, qui ci sarebbe una riga.
   */
  it("non ha speso niente: nessuna riga sul salvadanaio", async () => {
    const spent = await db.select({ id: budgetLedger.id }).from(budgetLedger);
    expect(spent).toHaveLength(0);
  });
});
