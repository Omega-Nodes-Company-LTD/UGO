import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accounts,
  auditLog,
  createDbClient,
  type DbClient,
  desires,
  gosini,
  meetings,
  memories,
  runMigrations,
  transcriptSegments,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { InitiativeSwitch } from "../../src/services/volition/initiativeSwitch.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * La scrivania (ADR-104): i gesti che si facevano solo in psql.
 *
 * Quello che solo un Postgres vero può dire non è «la rotta risponde 201»: è
 * che il **vicino riceve 404** su ognuna di queste porte (sono tutte azioni
 * distruttive o formative su una casa), che una cancellazione porta via
 * davvero anche ciò che dipende da lei, e che l'interruttore dell'iniziativa
 * — il difetto che ha originato l'ADR — **sopravvive a un riavvio del
 * processo e non tocca il vicino**.
 */

const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let mine: TestHouse;
let theirs: TestHouse;
let myToken = "";
let theirToken = "";

const boot = (): FastifyInstance =>
  buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      // l'interruttore nasce col processo, come in `index.ts`: ogni avvio ne
      // fa uno nuovo, ed è precisamente ciò che prima dimenticava la scelta
      initiative: new InitiativeSwitch(() => true),
      gosini: { dataKey: DATA_KEY },
    },
  });

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  mine = await createHouse(db, "casa-scrivania");
  theirs = await createHouse(db, "casa-vicini-scrivania");
  myToken = (await issueToken(db, { accountId: mine.id, role: "owner", label: "mia" })).token;
  theirToken = (await issueToken(db, { accountId: theirs.id, role: "owner", label: "loro" })).token;

  app = boot();
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

const post = (url: string, token: string, body: unknown, instance = app) =>
  instance.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify(body),
  });
const get = (url: string, token: string, instance = app) =>
  instance.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
const del = (url: string, token: string) =>
  app.inject({ method: "DELETE", url, headers: { authorization: `Bearer ${token}` } });

describe("il ritiro di un esemplare", () => {
  it("mette a riposo e rimette in servizio: ritirare non è cancellare", async () => {
    const off = await post(`/v1/gosini/${mine.gosinoId}/retire`, myToken, { retired: true });
    expect(off.statusCode).toBe(200);
    expect(off.json<{ retiredAt: string | null }>().retiredAt).not.toBeNull();

    // c'è ancora: i ricordi, il pedigree e la discendenza restano
    const [row] = await db.select().from(gosini).where(eq(gosini.id, mine.gosinoId));
    expect(row).toBeDefined();
    expect(row?.retiredAt).not.toBeNull();

    const on = await post(`/v1/gosini/${mine.gosinoId}/retire`, myToken, { retired: false });
    expect(on.statusCode).toBe(200);
    expect(on.json<{ retiredAt: string | null }>().retiredAt).toBeNull();
  });

  it("lascia una riga sul giornale, col verbo giusto", async () => {
    await post(`/v1/gosini/${mine.gosinoId}/retire`, myToken, { retired: true });
    await post(`/v1/gosini/${mine.gosinoId}/retire`, myToken, { retired: false });
    const rows = await db
      .select({ verb: auditLog.verb })
      .from(auditLog)
      .where(eq(auditLog.accountId, mine.id));
    const verbs = rows.map((r) => r.verb);
    expect(verbs).toContain("gosino_retired");
    expect(verbs).toContain("gosino_restored");
  });

  it("il vicino non può ritirare il mio, e non scopre nemmeno che esiste", async () => {
    const response = await post(`/v1/gosini/${mine.gosinoId}/retire`, theirToken, {
      retired: true,
    });
    expect(response.statusCode).toBe(404);
    const [row] = await db.select().from(gosini).where(eq(gosini.id, mine.gosinoId));
    expect(row?.retiredAt).toBeNull();
  });
});

describe("un ricordo scritto a mano", () => {
  it("nasce in chiaro, di questo esemplare, e dichiara di non avere vettore", async () => {
    const response = await post("/v1/memories", myToken, {
      gosinoId: mine.gosinoId,
      kind: "fact",
      text: "la caldaia si accende girando la manopola azzurra",
      importance: 0.8,
    });
    expect(response.statusCode).toBe(201);
    // senza embedder configurato la riga esiste e si ripesca solo per parole:
    // la risposta lo DICE invece di lasciarlo credere (lezione di ADR-091)
    expect(response.json<{ embedded: boolean }>().embedded).toBe(false);

    const [row] = await db
      .select()
      .from(memories)
      .where(eq(memories.id, response.json<{ id: string }>().id));
    expect(row?.gosinoId).toBe(mine.gosinoId);
    expect(row?.text).toContain("manopola azzurra");
    // in chiaro: niente prefisso di versione della cifratura
    expect(row?.text.startsWith("v1:")).toBe(false);
    expect(Number(row?.importance)).toBeCloseTo(0.8, 5);
  });

  it("non si scrive un ricordo nella testa del gosino del vicino", async () => {
    const response = await post("/v1/memories", theirToken, {
      gosinoId: mine.gosinoId,
      kind: "fact",
      text: "una cosa che non deve entrare qui",
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("i desideri dati e tolti a mano", () => {
  it("si aggiunge un promemoria e si annulla senza cancellarlo", async () => {
    const made = await post("/v1/volition/desires", myToken, {
      gosinoId: mine.gosinoId,
      text: "ricordagli di annaffiare",
      kind: "promemoria",
      dueHint: "domani mattina",
    });
    expect(made.statusCode).toBe(201);
    const id = made.json<{ id: string }>().id;

    const listed = await get("/v1/volition", myToken);
    expect(JSON.stringify(listed.json())).toContain("annaffiare");

    const cancelled = await del(`/v1/volition/desires/${id}`, myToken);
    expect(cancelled.statusCode).toBe(200);

    // la riga c'è ancora: ciò che aveva in mente ieri è biografia
    const [row] = await db.select().from(desires).where(eq(desires.id, id));
    expect(row).toBeDefined();
    expect(row?.status).toBe("expired");

    // e non è più in sospeso
    const after = await get("/v1/volition", myToken);
    expect(JSON.stringify(after.json())).not.toContain("annaffiare");
  });

  it("il vicino non annulla i desideri dei miei", async () => {
    const made = await post("/v1/volition/desires", myToken, {
      gosinoId: mine.gosinoId,
      text: "una cosa mia",
    });
    const id = made.json<{ id: string }>().id;
    const response = await del(`/v1/volition/desires/${id}`, theirToken);
    expect(response.statusCode).toBe(404);
    const [row] = await db.select().from(desires).where(eq(desires.id, id));
    expect(row?.status).toBe("pending");
  });
});

describe("le riunioni: rileggerle e buttarle", () => {
  const seedMeeting = async (house: TestHouse, title: string): Promise<string> => {
    const [meeting] = await db
      .insert(meetings)
      .values({ gosinoId: house.gosinoId, platform: "meet", title, status: "done" })
      .returning({ id: meetings.id });
    const id = meeting?.id ?? "";
    await db.insert(transcriptSegments).values({
      accountId: house.id,
      meetingId: id,
      speaker: "SPEAKER_01",
      t0: 0,
      t1: 2.5,
      text: encryptText("il preventivo lo mandiamo giovedì", DATA_KEY),
    });
    return id;
  };

  it("la trascrizione esce in chiaro, e il vicino non la vede", async () => {
    const id = await seedMeeting(mine, "preventivi");
    const response = await get(`/v1/meetings/${id}/transcript`, myToken);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ segments: { text: string }[] }>();
    expect(body.segments[0]?.text).toBe("il preventivo lo mandiamo giovedì");

    const theirs2 = await get(`/v1/meetings/${id}/transcript`, theirToken);
    expect(theirs2.statusCode).toBe(404);
  });

  it("l'elenco è della casa: quello del vicino non compare", async () => {
    await seedMeeting(mine, "la mia");
    await seedMeeting(theirs, "la loro");
    const listed = await get("/v1/meetings", myToken);
    const titles = listed.json<{ meetings: { title: string }[] }>().meetings.map((m) => m.title);
    expect(titles).toContain("la mia");
    expect(titles).not.toContain("la loro");
  });

  it("buttarla porta via anche i segmenti: è una cancellazione vera", async () => {
    const id = await seedMeeting(mine, "da buttare");
    const response = await del(`/v1/meetings/${id}`, myToken);
    expect(response.statusCode).toBe(200);

    const left = await db.select().from(meetings).where(eq(meetings.id, id));
    expect(left).toHaveLength(0);
    const segments = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, id));
    expect(segments).toHaveLength(0);
  });

  it("il vicino non butta le mie riunioni", async () => {
    const id = await seedMeeting(mine, "non toccarla");
    const response = await del(`/v1/meetings/${id}`, theirToken);
    expect(response.statusCode).toBe(404);
    expect(await db.select().from(meetings).where(eq(meetings.id, id))).toHaveLength(1);
  });
});

/**
 * Il difetto che ha originato l'ADR: l'interruttore viveva in un campo di un
 * oggetto per processo. Questi due test sono la sua lapide.
 */
describe("l'interruttore dell'iniziativa", () => {
  it("spegnerlo in casa mia non zittisce il vicino", async () => {
    const off = await post("/v1/volition/enabled", myToken, { enabled: false });
    expect(off.statusCode).toBe(200);
    expect(off.json<{ enabled: boolean; overridden: boolean }>()).toMatchObject({
      enabled: false,
      overridden: true,
    });

    const neighbour = await get("/v1/volition", theirToken);
    expect(neighbour.json<{ initiative: { overridden: boolean } }>().initiative.overridden).toBe(
      false,
    );

    const [row] = await db.select().from(accounts).where(eq(accounts.id, theirs.id));
    expect(row?.initiative).toBeNull();
  });

  it("sopravvive a un riavvio del processo, e si può restituire la parola al server", async () => {
    await post("/v1/volition/enabled", myToken, { enabled: false });

    // un processo nuovo: è esattamente ciò che prima azzerava la scelta
    const restarted = boot();
    await restarted.ready();
    try {
      const seen = await get("/v1/volition", myToken, restarted);
      expect(seen.json<{ initiative: { enabled: boolean; overridden: boolean } }>().initiative)
        .toMatchObject({ enabled: false, overridden: true });

      const back = await post("/v1/volition/enabled", myToken, { enabled: null }, restarted);
      expect(back.json<{ overridden: boolean }>().overridden).toBe(false);
      const [row] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, mine.id), eq(accounts.slug, mine.slug)));
      expect(row?.initiative).toBeNull();
    } finally {
      await restarted.close();
    }
  });
});
