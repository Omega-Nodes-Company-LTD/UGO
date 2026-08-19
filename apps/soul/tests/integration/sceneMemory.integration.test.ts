import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { budgetLedger, createDbClient, type DbClient, memories, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { SceneMemory } from "../../src/services/sceneMemory.js";

/**
 * ADR-108 sul giro vero: «ricordati questo» deve diventare una RIGA, in
 * chiaro (ADR-091, o il braccio lessicale non la trova mai) e senza sfiorare
 * il provider. E i pixel non devono finire da nessuna parte.
 */

const MASTER_KEY = randomBytes(32);
const FRAME = Buffer.from("finti-pixel-di-un-cartellino").toString("base64");

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let casa: { accountId: string; gosinoId: string };
let chat: ChatService;
/** cosa ha visto il corpo, e quante volte gliel'hanno chiesto */
let asked: boolean[];
let gaveFrame: boolean;

const say = (text: string) => chat.handle({ channel: "home", text });

/** un corpo col contratto vero: alla richiesta tiene un frame, e lo dà una volta */
function body() {
  let held: string | undefined;
  return {
    hasBody: () => true,
    askGlimpse: (fine = false) => {
      asked.push(fine);
      if (gaveFrame) held = FRAME;
    },
    takeGlimpse: () => {
      const taken = held;
      held = undefined;
      return taken;
    },
  };
}

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  casa = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-sguardo",
    name: "Casa Sguardo",
    gosinoName: "Ugo",
  });

  asked = [];
  gaveFrame = true;
  const keepsake = new SceneMemory({
    gateway: () => body(),
    db,
    gosinoId: casa.gosinoId,
    // i due occhi, come in produzione: la percezione legge, il vision descrive
    ocr: () => Promise.resolve("GAMER PC   749,00 EUR"),
    vision: { describe: () => Promise.resolve("un computer rosso acceso su un bancone") },
    waitMs: 200,
    pollMs: 10,
  });

  chat = new ChatService({
    db,
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: {
      chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
    },
    psyche: await PsycheService.restore(db, new Date(), casa.gosinoId),
    dataKey: MASTER_KEY,
    timezone: "Europe/Rome",
    locale: "it-IT",
    gosinoId: casa.gosinoId,
    accountId: casa.accountId,
    character: characterFrom({}),
    keepsake,
  });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("«ricordati questo»", () => {
  it("chiede lo sguardo FINE e scrive un ricordo in chiaro", async () => {
    const response = await say("ricordati questo");
    expect(response.reply).toContain("me lo segno");

    // 640px: l'OCR su 320 vede macchie (ADR-065), e qui serve anche a lui
    expect(asked).toEqual([true]);

    const rows = await db.select().from(memories).where(eq(memories.gosinoId, casa.gosinoId));
    expect(rows).toHaveLength(1);
    const kept = rows[0];
    // le due metà ci sono entrambe: la scena per ritrovarlo, le lettere per il dettaglio
    expect(kept?.text).toContain("computer rosso");
    expect(kept?.text).toContain("749,00");
    // in chiaro (ADR-091): il braccio lessicale gira sul testo, non sul ciphertext
    expect(kept?.text.startsWith("v1:")).toBe(false);
    expect(kept?.kind).toBe("episode");
    expect((kept?.sourceRefs as { from?: string }).from).toBe("sguardo");
    // e i pixel non sono finiti dentro la riga
    expect(kept?.text).not.toContain(FRAME);
  });

  it("si ripesca cercando la parola, che è tutto il punto", async () => {
    const found = await db.execute<{ text: string }>(
      // lo stesso braccio lessicale di ADR-022, sulla colonna generata
      "select text from memories where search_vector @@ plainto_tsquery('italian', 'computer rosso')",
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it("non costa niente: nessuna riga sul salvadanaio", async () => {
    const spent = await db
      .select()
      .from(budgetLedger)
      .where(eq(budgetLedger.accountId, casa.accountId));
    expect(spent).toHaveLength(0);
  });

  it("camera spenta: lo dice, e non scrive un ricordo vuoto", async () => {
    gaveFrame = false;
    const before = await db.select().from(memories).where(eq(memories.gosinoId, casa.gosinoId));
    const response = await say("segnati questo");
    expect(response.reply).toContain("camera è spenta");
    const after = await db.select().from(memories).where(eq(memories.gosinoId, casa.gosinoId));
    expect(after).toHaveLength(before.length);
    gaveFrame = true;
  });

  it("i vicini pericolosi NON accendono la camera", async () => {
    const before = await db.select().from(memories).where(eq(memories.gosinoId, casa.gosinoId));
    const asksBefore = asked.length;
    // «ricordami di…» porta un compito: è di ADR-028, e senza un'ora prosegue
    // verso il modello invece di guardare — che è precisamente ciò che si prova
    await expect(say("ricordami di comprare il latte")).rejects.toThrow();
    await expect(say("cosa ti ricordi di marzo?")).resolves.toBeDefined();
    await expect(say("come stai?")).rejects.toThrow();

    expect(asked.length).toBe(asksBefore);
    const after = await db.select().from(memories).where(eq(memories.gosinoId, casa.gosinoId));
    expect(after).toHaveLength(before.length);
  });
});
