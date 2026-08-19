import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  auditLog,
  beings,
  events,
  createDbClient,
  type DbClient,
  messages,
  perceptionEvents,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-099: il giornale, le conversazioni e gli incontri.
 *
 * Tre viste che esistevano solo in `psql`. I casi che contano non sono «la
 * lista risponde»: sono che il **vicino non compare**, che il testo esce **in
 * chiaro** (è ciphertext a riposo), e che l'impronta biometrica **non esce**
 * nemmeno da qui — la vista serve a capire se il riconoscimento funziona, non
 * a portarselo via.
 */

const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let mine: TestHouse;
let theirs: TestHouse;
let myToken = "";
let theirToken = "";

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  mine = await createHouse(db, "casa-giornale");
  theirs = await createHouse(db, "casa-vicini-giornale");
  myToken = (await issueToken(db, { accountId: mine.id, role: "owner", label: "mia" })).token;
  theirToken = (await issueToken(db, { accountId: theirs.id, role: "owner", label: "loro" })).token;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      gosini: { dataKey: DATA_KEY },
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

const get = (url: string, token: string) =>
  app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

describe("il giornale (ADR-099)", () => {
  it("mostra i verbi della mia casa e nessuno di quella del vicino", async () => {
    await db.insert(auditLog).values([
      { accountId: mine.id, verb: "export", outcome: "ok", resourceType: "account", role: "owner" },
      { accountId: theirs.id, verb: "forget", outcome: "ok", resourceType: "being" },
    ]);

    const view = await get("/v1/audit", myToken);
    expect(view.statusCode).toBe(200);
    const verbs = view.json<{ righe: { verb: string }[] }>().righe.map((r) => r.verb);
    expect(verbs).toContain("export");
    expect(verbs).not.toContain("forget");
  });

  it("non ha una colonna dove infilare un nome, ed è il patto di ADR-049", async () => {
    const view = await get("/v1/audit", myToken);
    const [row] = view.json<{ righe: Record<string, unknown>[] }>().righe;
    expect(row).toBeDefined();
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "at",
      "id",
      "outcome",
      "resourceId",
      "resourceType",
      "role",
      "tokenId",
      "verb",
    ]);
  });

  it("va indietro col cursore invece di ricaricare un anno", async () => {
    const first = await get("/v1/audit?limite=1", myToken);
    const [row] = first.json<{ righe: { at: string }[] }>().righe;
    expect(row).toBeDefined();
    const older = await get(`/v1/audit?limite=1&prima=${encodeURIComponent(row?.at ?? "")}`, myToken);
    const [next] = older.json<{ righe: { at: string }[] }>().righe;
    // o è più vecchia, o non ce n'è: mai la stessa riga due volte
    if (next !== undefined) expect(new Date(next.at).getTime()).toBeLessThan(new Date(row?.at ?? "").getTime());
  });
});

describe("le conversazioni di casa (ADR-099)", () => {
  it("escono IN CHIARO, che è come il proprietario le ha dette", async () => {
    const [who] = await db
      .insert(beings)
      .values({ accountId: mine.id, displayName: "Ivan" })
      .returning({ id: beings.id });
    await db.insert(messages).values({
      gosinoId: mine.gosinoId,
      channel: "home",
      role: "user",
      beingId: who?.id ?? null,
      text: encryptText("il corriere passa il martedì", DATA_KEY),
    });

    const view = await get("/v1/messages", myToken);
    expect(view.statusCode).toBe(200);
    const [row] = view.json<{ messaggi: { text: string; who: string | null }[] }>().messaggi;
    expect(row?.text).toBe("il corriere passa il martedì");
    expect(row?.who).toBe("Ivan");
  });

  it("e il vicino non le vede, nemmeno cifrate", async () => {
    const view = await get("/v1/messages", theirToken);
    expect(view.json<{ messaggi: unknown[] }>().messaggi).toHaveLength(0);
  });
});

describe("chi ha visto, e cosa (ADR-099)", () => {
  it("dice il nome e quanto ci credeva, mai l'impronta", async () => {
    const [seen] = await db
      .insert(beings)
      .values({ accountId: mine.id, displayName: "Marco" })
      .returning({ id: beings.id });
    await db.insert(perceptionEvents).values({
      gosinoId: mine.gosinoId,
      modality: "face",
      beingId: seen?.id ?? null,
      confidence: 0.87,
      observed: { label: "in cucina" },
    });

    const view = await get("/v1/perception", myToken);
    expect(view.statusCode).toBe(200);
    const [row] = view.json<{
      incontri: Record<string, unknown>[];
    }>().incontri;
    expect(row?.who).toBe("Marco");
    expect(row?.confidence).toBeCloseTo(0.87, 2);
    // nessuna colonna che porti un vettore o un ciphertext biometrico
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "confidence",
      "gosinoId",
      "id",
      "modality",
      "observed",
      "ts",
      "who",
    ]);
  });

  it("un token che non amministra non sfoglia la biografia della casa", async () => {
    const guest = (await issueToken(db, { accountId: mine.id, role: "member", label: "ospite" }))
      .token;
    expect((await get("/v1/audit", guest)).statusCode).toBe(403);
    expect((await get("/v1/messages", guest)).statusCode).toBe(403);
    expect((await get("/v1/perception", guest)).statusCode).toBe(403);
  });
});

/**
 * ADR-101: i rapporti dei job e i chioschi collegati.
 */
describe("i rapporti dei job (ADR-101)", () => {
  it("dice l'ULTIMA volta per ogni passo, non le ultime duecento righe", async () => {
    const older = new Date(Date.now() - 86_400_000);
    await db.insert(events).values([
      {
        gosinoId: mine.gosinoId,
        ts: older,
        source: "system",
        type: "dream_step_completed",
        payload: { step: "backup", date: "2026-08-17", mode: "full" },
      },
      {
        gosinoId: mine.gosinoId,
        source: "system",
        type: "dream_step_completed",
        payload: { step: "backup", date: "2026-08-18", mode: "full" },
      },
      {
        gosinoId: mine.gosinoId,
        source: "system",
        type: "dream_step_completed",
        payload: { step: "hygiene", date: "2026-08-18", mode: "light" },
      },
    ]);

    const view = await get("/v1/jobs/reports", myToken);
    expect(view.statusCode).toBe(200);
    const steps = view.json<{ passi: { step: string; date: string }[] }>().passi;
    // un passo, una riga: la domanda è «gira ancora?»
    expect(steps.filter((p) => p.step === "backup")).toHaveLength(1);
    expect(steps.find((p) => p.step === "backup")?.date).toBe("2026-08-18");
    expect(steps.map((p) => p.step)).toContain("hygiene");
  });

  it("e i passi del vicino non finiscono nel mio rapporto", async () => {
    await db.insert(events).values({
      gosinoId: theirs.gosinoId,
      source: "system",
      type: "dream_step_completed",
      payload: { step: "solo-del-vicino", date: "2026-08-18" },
    });
    const view = await get("/v1/jobs/reports", myToken);
    expect(view.json<{ passi: { step: string }[] }>().passi.map((p) => p.step)).not.toContain(
      "solo-del-vicino",
    );
  });

  it("i chioschi: senza registro dei socket la lista è vuota, non un errore", async () => {
    const view = await get("/v1/kiosks", myToken);
    expect(view.statusCode).toBe(200);
    expect(view.json<{ chioschi: unknown[] }>().chioschi).toEqual([]);
  });
});
