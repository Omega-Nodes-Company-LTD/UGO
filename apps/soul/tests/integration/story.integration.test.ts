import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, diaryEntries, messages, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { PsycheService } from "../../src/services/psycheService.js";

/**
 * La storia della buonanotte (ADR-088) sul giro vero.
 *
 * Due cose che si possono provare solo qui, e sono le due che contano:
 *
 * 1. che la storia **non passi mai dal provider a pagamento** — il provider,
 *    in questo test, esplode se qualcuno lo chiama;
 * 2. che quando il modello di casa **non c'è** UGO lo dica, invece di
 *    raccontare una favola precotta: la seconda sera si capirebbe che non
 *    c'era nessuno a raccontarla.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let who: string;
let houseId: string;

/** Quello che il modello di casa ha visto arrivare, per guardarci dentro. */
let seenPrompt: string | undefined;
let localAnswer: string | undefined;
let psyche: PsycheService;

const build = (withLocal: boolean): ChatService =>
  new ChatService({
    db,
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: {
      chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
    } as never,
    psyche,
    dataKey: DATA_KEY,
    timezone: "Europe/Rome",
    locale: "it-IT",
    gosinoId: who,
    accountId: houseId,
    character: characterFrom({}),
    ...(withLocal && {
      storyteller: {
        generate: (prompt: string) => {
          seenPrompt = prompt;
          return Promise.resolve(localAnswer);
        },
      },
    }),
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-storie",
    name: "Storie",
    gosinoName: "Ugo",
  });
  who = house.gosinoId;
  houseId = house.accountId;

  psyche = await PsycheService.restore(db, new Date(), who);

  await db.insert(diaryEntries).values({
    gosinoId: who,
    date: "2026-08-17",
    text: "Oggi ha piovuto tutto il giorno e siamo stati dentro",
  });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("la storia", () => {
  it("la scrive il modello di CASA, e il provider non viene sfiorato", async () => {
    localAnswer = "C'era una volta un maiale che contava le gocce sul vetro.";
    const said = await build(true).handle({ channel: "home", text: "raccontami una storia" });
    expect(said.reply).toContain("gocce sul vetro");
  });

  it("il prompt porta il suo carattere e la sua giornata, non una favola generica", () => {
    if (seenPrompt === undefined) throw new Error("nessun prompt");
    expect(seenPrompt).toContain("italiano");
    // la riga di diario di ieri: la storia parte da casa sua
    expect(seenPrompt).toContain("piovuto");
  });

  it("il tema chiesto arriva al modello", async () => {
    localAnswer = "storia del mare";
    await build(true).handle({ channel: "home", text: "raccontami una storia sul mare" });
    expect(seenPrompt).toContain("il mare");
  });

  it("se il modello di casa non risponde lo dice, e non inventa una favola finta", async () => {
    localAnswer = undefined;
    const said = await build(true).handle({ channel: "home", text: "raccontami una favola" });
    expect(said.reply).toContain("non mi viene");
    expect(said.reply.toLowerCase()).not.toContain("c'era una volta");
  });

  it("e finisce in biografia come ogni altro scambio, cifrata", async () => {
    const rows = await db.select().from(messages).where(eq(messages.gosinoId, who));
    const texts = rows.map((row) => decryptText(row.text, DATA_KEY));
    expect(texts.some((text) => text.includes("raccontami una storia"))).toBe(true);
  });

  it("«raccontami cos'hai fatto ieri» resta il diario: ricordare non è inventare", async () => {
    localAnswer = "NON DEVE ESSERE CHIESTA";
    const said = await build(true).handle({ channel: "home", text: "raccontami cos'hai fatto ieri" });
    expect(said.reply).toContain("piovuto");
    expect(said.reply).not.toContain("NON DEVE ESSERE CHIESTA");
  });
});
