import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { accessTokens, corrections, createDbClient, type DbClient, gosini, rooms, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-100: le chiavi di casa, le correzioni e il nome della stanza.
 *
 * I casi che contano: una chiave revocata **non apre più** (è il senso della
 * revoca, e provarlo richiede di riusarla); una correzione si può **togliere**;
 * e rinominare una stanza **non sfratta** chi ci vive — che è il difetto che
 * rendeva il rename una cancellazione travestita.
 */

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
  mine = await createHouse(db, "casa-chiavi");
  theirs = await createHouse(db, "casa-vicini-chiavi");
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
      // la PORTA CHIUSA: senza `internalToken` il server è aperto per lo
      // sviluppo e ogni token ignoto diventa un operatore — con quella
      // apertura «la chiave revocata non apre più» non vorrebbe dire niente
      internalToken: "chiuso-per-il-test",
      // le stanze vivono con la popolazione
      gosini: {},
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

const as = (token: string) => ({ authorization: `Bearer ${token}` });

describe("le chiavi di casa (ADR-100)", () => {
  it("si emette dal pannello, e il valore in chiaro esce una volta sola", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: as(myToken),
      payload: { label: "dock cucina", role: "member" },
    });
    expect(made.statusCode).toBe(201);
    const issued = made.json<{ id: string; token: string }>();
    expect(issued.token.length).toBeGreaterThan(20);

    // la lista la mostra, ma senza il valore: in database c'è solo l'hash
    const list = await app.inject({ method: "GET", url: "/v1/tokens", headers: as(myToken) });
    const row = list.json<{ chiavi: Record<string, unknown>[] }>().chiavi.find((k) => k.id === issued.id);
    expect(row?.label).toBe("dock cucina");
    expect(JSON.stringify(row)).not.toContain(issued.token);
  });

  it("revocata NON apre più — provato riusandola, non guardando la colonna", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: as(myToken),
      payload: { label: "telefono perso", role: "owner" },
    });
    const issued = made.json<{ id: string; token: string }>();

    // prima funziona
    const before = await app.inject({ method: "GET", url: "/v1/tokens", headers: as(issued.token) });
    expect(before.statusCode).toBe(200);

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/tokens/${issued.id}`,
      headers: as(myToken),
    });
    expect(revoked.statusCode).toBe(204);

    // e dopo no. La riga resta: sapere che c'era vale quanto sapere che non vale più
    const after = await app.inject({ method: "GET", url: "/v1/tokens", headers: as(issued.token) });
    expect(after.statusCode).toBe(401);
    const [row] = await db.select().from(accessTokens).where(eq(accessTokens.id, issued.id));
    expect(row?.revokedAt).not.toBeNull();
  });

  it("la chiave del vicino non si vede e non si brucia", async () => {
    const list = await app.inject({ method: "GET", url: "/v1/tokens", headers: as(theirToken) });
    const labels = list.json<{ chiavi: { label: string }[] }>().chiavi.map((k) => k.label);
    expect(labels).not.toContain("dock cucina");

    const [mineRow] = await db
      .select({ id: accessTokens.id })
      .from(accessTokens)
      .where(eq(accessTokens.accountId, mine.id));
    const cross = await app.inject({
      method: "DELETE",
      url: `/v1/tokens/${mineRow?.id ?? ""}`,
      headers: as(theirToken),
    });
    expect(cross.statusCode).toBe(404);
  });
});

describe("le correzioni (ADR-100)", () => {
  it("si vedono e si ritirano: la propria parola si può ritirare", async () => {
    const [row] = await db
      .insert(corrections)
      .values({ gosinoId: mine.gosinoId, signal: "too_loud", payload: { text: "parli troppo forte" } })
      .returning({ id: corrections.id });

    const list = await app.inject({ method: "GET", url: "/v1/corrections", headers: as(myToken) });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ correzioni: { id: string }[] }>().correzioni.map((c) => c.id)).toContain(
      row?.id,
    );

    const gone = await app.inject({
      method: "DELETE",
      url: `/v1/corrections/${row?.id ?? ""}`,
      headers: as(myToken),
    });
    expect(gone.statusCode).toBe(204);
    const left = await db.select().from(corrections).where(eq(corrections.id, row?.id ?? ""));
    expect(left).toHaveLength(0);
  });

  it("quelle del vicino non si toccano", async () => {
    const [row] = await db
      .insert(corrections)
      .values({ gosinoId: theirs.gosinoId, signal: "too_loud", payload: {} })
      .returning({ id: corrections.id });
    const cross = await app.inject({
      method: "DELETE",
      url: `/v1/corrections/${row?.id ?? ""}`,
      headers: as(myToken),
    });
    expect(cross.statusCode).toBe(404);
  });
});

describe("rinominare una stanza (ADR-100)", () => {
  it("chi ci vive RESTA dov'è: il nome è un'etichetta, non un trasloco", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: as(myToken),
      payload: { name: "Cuciina" },
    });
    expect([200, 201]).toContain(made.statusCode);
    const roomId = made.json<{ id: string }>().id;
    await db
      .update(gosini)
      .set({ locationLabel: "Cuciina" })
      .where(eq(gosini.id, mine.gosinoId));

    const renamed = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: as(myToken),
      payload: { name: "Cucina" },
    });
    expect(renamed.statusCode).toBe(200);

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    expect(room?.name).toBe("Cucina");
    expect(room?.slug).toBe("cucina");
    // il difetto che rendeva il rename una cancellazione travestita
    const [who] = await db.select().from(gosini).where(eq(gosini.id, mine.gosinoId));
    expect(who?.locationLabel).toBe("Cucina");
  });

  it("due stanze con lo stesso nome sono una stanza: 409", async () => {
    await app.inject({ method: "POST", url: "/v1/rooms", headers: as(myToken), payload: { name: "Studio" } });
    const made = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: as(myToken),
      payload: { name: "Salotto" },
    });
    const clash = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${made.json<{ id: string }>().id}`,
      headers: as(myToken),
      payload: { name: "studio" },
    });
    expect(clash.statusCode).toBe(409);
  });
});
