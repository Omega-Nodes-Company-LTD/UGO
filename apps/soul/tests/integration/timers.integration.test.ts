import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  type DbClient,
  desires,
  messages,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createHousehold } from "../../src/services/householdService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { TimerWatch } from "../../src/services/volition/timerWatch.js";

/**
 * Il timer e la sveglia (ADR-078) sul giro vero.
 *
 * Quello che solo un database può dire sta tutto in tre righe:
 *
 * 1. che il gesto **non passa dal provider** — il client LLM qui punta a una
 *    porta chiusa, quindi se qualcuno lo chiamasse il test morirebbe, e il
 *    `budget_ledger` resta vuoto per prova;
 * 2. che il timer **suona una volta sola** — una sveglia che non si spegne è
 *    il difetto peggiore che questa cosa possa avere;
 * 3. che lo scambio finisce **in biografia cifrato**, come ogni altro: una
 *    scorciatoia sul costo non è una scorciatoia sulla memoria.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let chat: ChatService;
let watch: TimerWatch;
let who: string;
/** Quello che il corpo ha sentito dire, in ordine. */
const spoken: string[] = [];

/** Le 20:00 in casa, che è l'ora in cui si mette un timer per la pasta. */
const EVENING = new Date("2026-08-18T20:00:00.000Z");
const later = (seconds: number): Date => new Date(EVENING.getTime() + seconds * 1000);

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createHousehold(db, MASTER_KEY, {
    slug: "casa-timer",
    name: "Timer",
    gosinoName: "Ugo",
  });
  who = house.gosinoId;

  const psyche = await PsycheService.restore(db, EVENING, who);
  const gateway = {
    broadcastSpeak: (text: string): void => {
      spoken.push(text);
    },
    hasBody: () => true,
  };

  chat = new ChatService({
    db,
    // il provider non esiste: se un gesto lo raggiungesse, il test morirebbe
    embedder: { embed: () => Promise.reject(new Error("mai")) },
    llm: {
      chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
    } as never,
    psyche,
    dataKey: DATA_KEY,
    timezone: "UTC",
    locale: "it-IT",
    gosinoId: who,
    householdId: house.householdId,
    character: characterFrom({}),
  });

  watch = new TimerWatch({ db, gateway, gosinoId: who });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

const say = (text: string, at: Date = EVENING) =>
  chat.handle({ text, channel: "home" }, at);

const pending = async () =>
  db.select().from(desires).where(eq(desires.gosinoId, who));

describe("il timer, dal comando alla suoneria", () => {
  it("si mette parlando, e il provider non lo sa nemmeno", async () => {
    const answer = await say("metti un timer di 10 minuti per la pasta");
    expect(answer.reply).toBe("Timer di 10 minuti per pasta: parte adesso.");

    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("timer");
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.dueAt?.getTime()).toBe(later(600).getTime());

    // zero token: nessuna riga sul libro mastro, e il provider era una porta chiusa
    expect(await db.select().from(budgetLedger)).toHaveLength(0);
  });

  it("lo scambio è in biografia, e cifrato", async () => {
    const rows = await db.select().from(messages).where(eq(messages.gosinoId, who));
    expect(rows).toHaveLength(2);
    // ciphertext sul disco: il testo in chiaro non c'è
    expect(rows.map((row) => row.text).join(" ")).not.toContain("pasta");
    expect(decryptText(rows[0]?.text ?? "", DATA_KEY)).toContain("timer di 10 minuti");
  });

  it("prima che scada non suona, e quando scade suona UNA volta", async () => {
    expect(await watch.tick(later(599))).toBe(0);
    expect(spoken).toHaveLength(0);

    expect(await watch.tick(later(600))).toBe(1);
    expect(spoken).toEqual(["Driiin! Il timer è finito: pasta."]);

    // e il giro dopo tace: una sveglia che non si spegne è il difetto peggiore
    expect(await watch.tick(later(900))).toBe(0);
    expect(spoken).toHaveLength(1);
  });
});

describe("chiedere, spegnere, rimettere", () => {
  it("«quanto manca?» risponde coi minuti veri", async () => {
    await say("metti un timer di 10 minuti");
    const answer = await say("quanto manca al timer?", later(120));
    expect(answer.reply).toBe("Al timer mancano 8 minuti.");
  });

  it("metterne un altro sostituisce il primo: non ne suonano due", async () => {
    await say("timer di 5 minuti", later(200));
    const alive = (await pending()).filter((row) => row.status === "pending");
    expect(alive).toHaveLength(1);
    expect(alive[0]?.dueAt?.getTime()).toBe(later(500).getTime());
  });

  it("si spegne, e spento non è suonato", async () => {
    expect((await say("spegni il timer", later(300))).reply).toBe("Timer spento.");
    const rows = await pending();
    expect(rows.filter((row) => row.status === "pending")).toHaveLength(0);
    // `expired`, non `done`: la differenza fra «l'ho tolto» e «ha suonato»
    expect(rows.filter((row) => row.status === "expired").length).toBeGreaterThan(0);
    expect((await say("quanto manca al timer?", later(310))).reply).toBe("Non c'è nessun timer.");
  });
});

describe("la sveglia, che è un'altra cosa", () => {
  it("«svegliami alle 7» — la frase che prima finiva dal provider", async () => {
    const answer = await say("svegliami alle 7", later(400));
    expect(answer.reply).toBe("Sveglia alle 7:00. Ci penso io.");
    const alarm = (await pending()).find((row) => row.kind === "sveglia");
    expect(alarm?.status).toBe("pending");
    // sono le 20:06, quindi le 7 sono quelle di domani
    expect(alarm?.dueAt?.getTime()).toBe(new Date("2026-08-19T07:00:00.000Z").getTime());
  });

  it("e quando suona non dice «mi avevi detto di ricordarti»", async () => {
    spoken.length = 0;
    expect(await watch.tick(new Date("2026-08-19T07:00:01.000Z"))).toBe(1);
    expect(spoken).toEqual(["Sveglia! Sono le 7:00."]);
  });

  it("un promemoria resta un promemoria, e non lo tocca nessuno dei due", async () => {
    await say("ricordami di chiamare la banca alle 9", new Date("2026-08-19T08:00:00.000Z"));
    const rows = await pending();
    const reminder = rows.find((row) => row.kind === "promemoria");
    expect(reminder?.text).toContain("chiamare la banca");
    // la sentinella del timer non lo fa suonare: non è roba sua
    spoken.length = 0;
    expect(await watch.tick(new Date("2026-08-19T10:00:00.000Z"))).toBe(0);
    expect(spoken).toHaveLength(0);
  });
});
