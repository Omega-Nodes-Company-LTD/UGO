import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  type DbClient,
  listItems,
  messages,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { PsycheService } from "../../src/services/psycheService.js";

/**
 * Le liste (ADR-076) sul giro vero.
 *
 * Le due cose che solo un giro completo prova: che «aggiungi il latte alla
 * spesa» diventi una riga vera **senza sfiorare il provider**, e che non
 * lasci NIENTE sul `budget_ledger` — che è il punto di risolvere i gesti in
 * casa invece di darli a un modello.
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
    slug: "casa-liste",
    name: "Liste",
    gosinoName: "Segna",
  });
  houseId = house.accountId;
  who = house.gosinoId;

  chat = new ChatService({
    db,
    // il provider non esiste: se un gesto lo raggiungesse, il test morirebbe
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
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

const openItems = async (list: string): Promise<string[]> => {
  const rows = await db
    .select({ text: listItems.text, done: listItems.done })
    .from(listItems)
    .where(eq(listItems.accountId, houseId));
  return rows
    .filter((row) => !row.done)
    .map((row) => decryptText(row.text, DATA_KEY))
    .filter(() => list !== "");
};

describe("i gesti di lista", () => {
  it("«aggiungi il latte alla spesa» diventa una riga vera, senza provider", async () => {
    const response = await say("aggiungi il latte alla spesa");
    expect(response.reply).toContain("latte");

    const rows = await db.select().from(listItems).where(eq(listItems.accountId, houseId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.list).toBe("spesa");
    expect(decryptText(rows[0]?.text ?? "", DATA_KEY)).toBe("latte");
    // cifrata a riposo: cosa compra una famiglia è una fotografia di come vive
    expect(rows[0]?.text).not.toContain("latte");
  });

  it("rileggere la lista dice cosa c'è", async () => {
    await say("aggiungi il pane alla spesa");
    const response = await say("cosa c'è nella spesa?");
    expect(response.reply).toContain("latte");
    expect(response.reply).toContain("pane");
  });

  it("«ho preso il pane» la spunta invece di cancellarla", async () => {
    const response = await say("ho preso il pane");
    expect(response.reply).toContain("Tolto");
    const open = await openItems("spesa");
    expect(open).toEqual(["latte"]);
    // la riga c'è ancora, spuntata: una lista è una storia, non un contatore
    const all = await db.select().from(listItems).where(eq(listItems.accountId, houseId));
    expect(all).toHaveLength(2);
    expect(all.filter((row) => row.done)).toHaveLength(1);
  });

  it("una lista nuova non chiede una migrazione", async () => {
    await say("segna le viti M3 in ferramenta");
    const rows = await db
      .select({ list: listItems.list })
      .from(listItems)
      .where(eq(listItems.accountId, houseId));
    expect(rows.map((row) => row.list)).toContain("ferramenta");
  });

  it("non costa niente: nessuna riga sul salvadanaio", async () => {
    const spend = await db.select().from(budgetLedger).where(eq(budgetLedger.gosinoId, who));
    expect(spend).toHaveLength(0);
  });

  it("lo scambio resta comunque nella biografia, cifrato", async () => {
    const rows = await db.select().from(messages).where(eq(messages.gosinoId, who));
    expect(rows.length).toBeGreaterThan(0);
    const texts = rows.map((row) => decryptText(row.text, DATA_KEY));
    expect(texts.some((text) => text.includes("aggiungi il latte"))).toBe(true);
    // e sul database non c'è in chiaro
    expect(rows.every((row) => !row.text.includes("aggiungi il latte"))).toBe(true);
  });

  it("una frase normale NON diventa una lista: arriverebbe al provider, e infatti esplode", async () => {
    // il modello di questo test rifiuta sempre: se «come stai?» fosse preso
    // per un gesto di lista, questa riga passerebbe invece di fallire
    await expect(say("come stai?")).rejects.toThrow();
  });
});
