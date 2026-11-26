import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { accounts, budgetLedger, createDbClient, runMigrations, type DbClient } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { DEFAULT_CHAT_MODEL, LlmClient } from "@ugo/memory";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";

/**
 * Chat e lavoro di sfondo sulla STESSA casa: la coda del tetto è per casa
 * (`LlmClient.queues`), quindi una chiamata lenta di sfondo (iniziativa,
 * ruminazione, sogno) tiene davanti la chat. Questo test lo MISURA su
 * OpenRouter vero (regola 1: niente server finti) e fissa due fatti:
 *  - stessa casa e stessa corsia → le chiamate si susseguono, mai in parallelo;
 *  - sfondo e chat hanno corsie separate → la chat non aspetta lo sfondo;
 *  - case diverse → non si aspettano.
 * Non asserisce velocità assolute, solo l'ordine; i tempi escono in console.
 * Richiede OPENROUTER_API_KEY e spende pochi centesimi.
 */
const apiKey = process.env.OPENROUTER_API_KEY ?? "";
if (apiKey === "") throw new Error("OPENROUTER_API_KEY è obbligatoria: questo test parla col fornitore vero");

let container: StartedPostgreSqlContainer;
let db: DbClient;
const houses: { accountId: string; gosinoId: string }[] = [];

const clientFor = (house: { accountId: string; gosinoId: string }, lane?: "chat" | "background"): LlmClient =>
  new LlmClient({
    db,
    apiKey,
    model: DEFAULT_CHAT_MODEL,
    dailyBudgetUsd: 5,
    accountId: house.accountId,
    gosinoId: house.gosinoId,
    timeoutMs: 90_000,
    ...(lane !== undefined && { lane }),
  });

interface Span {
  start: number;
  end: number;
}
async function timed(run: () => Promise<unknown>): Promise<Span> {
  const start = performance.now();
  await run();
  return { start, end: performance.now() };
}

const BACKGROUND_PROMPT = "Scrivi in italiano un racconto di circa 250 parole su un gatto che impara a leggere.";

beforeAll(async () => {
  const started = await startPostgres();
  container = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  for (const slug of ["casa-uno", "casa-due"]) {
    const house = await createAccountWithFounder(db, randomBytes(32), { slug, name: slug, gosinoName: "Ugo" });
    await db.update(accounts).set({ dailyBudgetUsd: "5.0000" }).where(eq(accounts.id, house.accountId));
    houses.push({ accountId: house.accountId, gosinoId: house.gosinoId });
  }
}, 180_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("chat e sfondo sul fornitore vero", () => {
  it("sulla stessa casa la chat aspetta lo sfondo; su un'altra casa no", async () => {
    const [one, two] = houses;
    if (one === undefined || two === undefined) throw new Error("fixture");

    // riferimento: la chat da sola
    const alone = await timed(() => clientFor(one).chat({ channel: "home", userText: "Rispondi solo: ok." }));

    // stessa casa: sfondo lungo davanti, chat subito dopo (client diversi, come fa llmFor)
    const bgSame = timed(() => clientFor(one).generate(BACKGROUND_PROMPT, 400, 0.7));
    const chatSame = timed(() => clientFor(one).chat({ channel: "home", userText: "Rispondi solo: ok." }));
    const [bgS, chatS] = await Promise.all([bgSame, chatSame]);

    // stessa casa, ma lo sfondo ha la sua corsia: la chat non lo aspetta
    const bgLane = timed(() => clientFor(one, "background").generate(BACKGROUND_PROMPT, 400, 0.7));
    const chatLane = timed(() => clientFor(one).chat({ channel: "home", userText: "Rispondi solo: ok." }));
    const [bgL, chatL] = await Promise.all([bgLane, chatLane]);

    // due lavori di sfondo sulla stessa casa: fra loro restano in fila (il tetto)
    const bgFirst = timed(() => clientFor(one, "background").generate(BACKGROUND_PROMPT, 400, 0.7));
    const bgSecond = timed(() => clientFor(one, "background").generate("Rispondi solo: ok.", 20, 0));
    const [bgF, bgSec] = await Promise.all([bgFirst, bgSecond]);

    // altra casa: stesso sfondo sulla prima, chat sulla seconda
    const bgOther = timed(() => clientFor(one).generate(BACKGROUND_PROMPT, 400, 0.7));
    const chatOther = timed(() => clientFor(two).chat({ channel: "home", userText: "Rispondi solo: ok." }));
    const [bgO, chatO] = await Promise.all([bgOther, chatOther]);

    const ms = (n: number): string => `${String(Math.round(n))} ms`;
    console.log(
      [
        `chat da sola: ${ms(alone.end - alone.start)}`,
        `stessa casa: sfondo ${ms(bgS.end - bgS.start)}, chat ${ms(chatS.end - chatS.start)} (finisce ${ms(chatS.end - bgS.end)} dopo lo sfondo)`,
        `corsia di sfondo: sfondo ${ms(bgL.end - bgL.start)}, chat ${ms(chatL.end - chatL.start)} (finisce ${ms(chatL.end - bgL.end)} dopo lo sfondo)`,
        `sfondo+sfondo: primo ${ms(bgF.end - bgF.start)}, secondo finisce ${ms(bgSec.end - bgF.end)} dopo il primo`,
        `altra casa: sfondo ${ms(bgO.end - bgO.start)}, chat ${ms(chatO.end - chatO.start)} (finisce ${ms(chatO.end - bgO.end)} dopo lo sfondo)`,
      ].join("\n"),
    );

    expect(chatS.end).toBeGreaterThan(bgS.end); // in coda: finisce dopo lo sfondo
    expect(chatL.end).toBeLessThan(bgL.end); // stessa casa, corsia di sfondo: la chat non aspetta
    expect(bgSec.end).toBeGreaterThan(bgF.end); // nella stessa corsia si resta in fila
    expect(chatO.end).toBeLessThan(bgO.end); // casa diversa: non lo aspetta

    // ogni chiamata ha lasciato la sua riga sul registro (nessuna spesa persa nella corsa)
    const rows = await db.select().from(budgetLedger);
    expect(rows.length).toBe(9); // 1 da sola + 2 stessa corsia + 2 corsie diverse + 2 sfondo + 2 case diverse
  }, 300_000);
});
