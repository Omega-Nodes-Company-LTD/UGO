import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { checkins, createDbClient, type DbClient, desires, gosini, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CheckinWatch } from "../../src/services/checkinService.js";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { buildServer } from "../../src/server.js";

/**
 * Il check-in (ADR-085) su database vero.
 *
 * Le tre cose che solo un database può dire, e sono le tre in cui questo
 * meccanismo può diventare insopportabile:
 *
 * 1. che chieda **una volta al giorno** e non a ogni giro della sentinella —
 *    la differenza fra qualcuno che si ricorda di chiedere e un assillo;
 * 2. che chieda **il giorno giusto**: «ogni lunedì» il martedì è rumore;
 * 3. che diventi un **desiderio** e non un promemoria — perché un promemoria
 *    salta le ore di quiete, e questo alle tre di notte non deve parlare.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let token: string;
let who: string;
let houseId: string;
let watch: CheckinWatch;
let voice: ChatService;

/** Un martedì, perché «ogni lunedì» abbia qualcosa contro cui sbagliare. */
const MARTEDI_21 = new Date("2026-08-18T19:00:00.000Z"); // 21:00 a Roma
const MARTEDI_08 = new Date("2026-08-18T06:00:00.000Z"); // 08:00 a Roma
const LUNEDI_09 = new Date("2026-08-17T07:00:00.000Z"); // 09:00 a Roma

/** Detto a voce, sul giro vero: se un gesto arrivasse al provider, esplode. */
const chat = (text: string) => voice.handle({ channel: "home", text });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-domande",
    name: "Domande",
    gosinoName: "Ugo",
  });
  token = house.ownerToken;
  who = house.gosinoId;
  houseId = house.accountId;
  watch = new CheckinWatch({ db, gosinoId: who, timezone: "Europe/Rome" });
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

describe("mettere una domanda a voce", () => {
  it("«ogni sera alle nove chiedimi com'è andata» non arriva al provider", async () => {
    // il provider qui non esiste: se la frase ci arrivasse, questa chiamata
    // fallirebbe invece di rispondere — ed è esattamente la prova che serve
    const reply = await chat("ogni sera alle nove chiedimi com'è andata la giornata");
    expect(reply.reply).toContain("21:00");

    const rows = await db.select().from(checkins).where(eq(checkins.gosinoId, who));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hour).toBe(21);
    expect(rows[0]?.weekday).toBeNull();
    expect(rows[0]?.question).toBe("com'è andata la giornata");
  });

  it("«ogni lunedì alle 9» tiene il giorno", async () => {
    await chat("ogni lunedì alle 9 chiedimi cosa devi fare questa settimana");
    const rows = await db.select().from(checkins).where(eq(checkins.gosinoId, who));
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.weekday === 1 && row.hour === 9)).toBe(true);
  });
});

describe("la sentinella", () => {
  it("prima dell'ora non chiede niente", async () => {
    const report = await watch.tick(MARTEDI_08);
    expect(report.asked).toBe(0);
    expect(await db.select().from(desires).where(eq(desires.gosinoId, who))).toHaveLength(0);
  });

  it("all'ora chiede, e diventa un DESIDERIO — non un promemoria", async () => {
    const report = await watch.tick(MARTEDI_21);
    expect(report.asked).toBe(1);

    const said = await db.select().from(desires).where(eq(desires.gosinoId, who));
    expect(said).toHaveLength(1);
    expect(said[0]?.text).toContain("com'è andata la giornata");
    // il tipo è ciò che decide chi lo dirà: un promemoria salta le ore di
    // quiete, un desiderio aspetta il momento buono. Alle tre di notte la
    // differenza è tutta
    expect(said[0]?.kind).toBe("desiderio");
    expect(said[0]?.dueAt).toBeNull();
  });

  it("un minuto dopo NON lo richiede: si chiede una volta al giorno", async () => {
    const again = await watch.tick(new Date(MARTEDI_21.getTime() + 60_000));
    expect(again.asked).toBe(0);
    expect(await db.select().from(desires).where(eq(desires.gosinoId, who))).toHaveLength(1);
  });

  it("«ogni lunedì» il martedì tace, e il lunedì parla", async () => {
    // il martedì alle 21 la domanda del lunedì è già stata saltata sopra:
    // qui il lunedì alle 9, e deve uscire solo quella
    const monday = await watch.tick(LUNEDI_09);
    expect(monday.asked).toBe(1);
    const said = await db.select().from(desires).where(eq(desires.gosinoId, who));
    expect(said.some((row) => row.text.includes("questa settimana"))).toBe(true);
  });

  it("chi se n'è andato non chiede più niente (ADR-075)", async () => {
    await db.update(gosini).set({ retiredAt: new Date() }).where(eq(gosini.id, who));
    const after = await watch.tick(new Date("2026-08-19T19:00:00.000Z"));
    expect(after.asked).toBe(0);
    await db.update(gosini).set({ retiredAt: null }).where(eq(gosini.id, who));
  });
});

describe("dal pannello", () => {
  it("le mostra tutte, con la loro ora", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/checkins",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ checkins: { id: string; hour: number }[] }>();
    expect(body.checkins).toHaveLength(2);
  });

  it("si tolgono, e il vicino non tocca le tue", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/v1/checkins",
      headers: { authorization: `Bearer ${token}` },
    });
    const first = list.json<{ checkins: { id: string }[] }>().checkins[0];
    if (first === undefined) throw new Error("nessun check-in");

    const other = await createAccountWithFounder(db, MASTER_KEY, {
      slug: "vicina-domande",
      name: "Vicina",
      gosinoName: "Altra",
    });
    const stranger = await app.inject({
      method: "DELETE",
      url: `/v1/checkins/${first.id}`,
      headers: { authorization: `Bearer ${other.ownerToken}` },
    });
    expect(stranger.statusCode).toBe(404);

    const mine = await app.inject({
      method: "DELETE",
      url: `/v1/checkins/${first.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mine.statusCode).toBe(200);
    expect(await db.select().from(checkins).where(eq(checkins.gosinoId, who))).toHaveLength(1);
  });

  it("«non chiedermelo più» le spegne tutte, e lo dice con un numero", async () => {
    const reply = await chat("non chiedermelo più");
    expect(reply.reply).toContain("1");
    expect(await db.select().from(checkins).where(eq(checkins.gosinoId, who))).toHaveLength(0);
  });
});
