import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accessTokens,
  auditLog,
  createDbClient,
  type DbClient,
  gosini,
  households,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { unwrapDataKey } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditLog } from "../../src/services/auditLog.js";
import { createHousehold, HouseholdSlugTakenError } from "../../src/services/householdService.js";
import { hashToken, issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";

/**
 * Far nascere una casa, e vedere solo la propria (ADR-019 fase 3, §162).
 *
 * Tutti i pezzi esistevano già e mancava l'orchestrazione, quindi ciò che vale
 * la pena provare è proprio quella: che i cinque atti siano **uno solo**, e che
 * il selettore non diventi la finestra da cui una famiglia guarda le altre.
 */

const MASTER_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      // le rotte sotto test non li sfiorano; se un giorno lo faranno, questo
      // cast smette di compilare per finta e il test lo dice subito
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
    },
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("ugo casa nuova", () => {
  it("builds the whole family in one act", async () => {
    const born = await createHousehold(db, MASTER_KEY, {
      slug: "Casa-Rossi",
      name: "  Rossi  ",
      timezone: "Europe/Lisbon",
      gosinoName: "Bruno",
      archetype: "pigrone",
    });

    const [house] = await db
      .select()
      .from(households)
      .where(eq(households.id, born.householdId));
    // lo slug è normalizzato perché finisce negli URL e nei log
    expect(house?.slug).toBe("casa-rossi");
    expect(house?.name).toBe("Rossi");
    expect(house?.timezone).toBe("Europe/Lisbon");

    // la DEK c'è ed è vera: si apre con la KEK, e non è la KEK
    const wrapped = house?.wrappedDataKey;
    expect(wrapped).not.toBeNull();
    if (wrapped == null) throw new Error("no wrapped data key");
    const dek = unwrapDataKey(wrapped, MASTER_KEY);
    expect(dek).toHaveLength(32);
    expect(dek.equals(MASTER_KEY)).toBe(false);

    // l'esemplare e il suo genoma versione 1
    const [creature] = await db.select().from(gosini).where(eq(gosini.id, born.gosinoId));
    expect(creature?.name).toBe("Bruno");
    const [genome] = await db
      .select()
      .from(traitSets)
      .where(eq(traitSets.gosinoId, born.gosinoId));
    expect(genome?.version).toBe(1);
    // pigrone: il genoma è arrivato, non un default
    expect((genome?.traits as { calm: number }).calm).toBeGreaterThan(0.8);

    // il token esiste solo come SHA-256: è ciò che rende vero «una volta sola»
    const [stored] = await db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.id, born.tokenId));
    expect(stored?.role).toBe("owner");
    expect(stored?.tokenHash).toBe(hashToken(born.ownerToken));
    expect(JSON.stringify(stored)).not.toContain(born.ownerToken);
  });

  it("nasce azienda quando lo chiedi, casa quando taci, e mai una terza cosa (ADR-061)", async () => {
    const firm = await createHousehold(db, MASTER_KEY, {
      slug: "studio-rossi",
      name: "Studio Rossi",
      kind: "business",
    });
    const [business] = await db
      .select({ kind: households.kind })
      .from(households)
      .where(eq(households.id, firm.householdId));
    expect(business?.kind).toBe("business");

    // il default è la casa: ogni tenant nato prima di ADR-061 è una casa
    const [home] = await db
      .select({ kind: households.kind })
      .from(households)
      .where(eq(households.slug, "casa-rossi"));
    expect(home?.kind).toBe("home");

    // il check del database rifiuta una natura inventata: non è convenzione
    await expect(
      db.execute(sql`update households set kind = 'circus' where id = ${firm.householdId}`),
    ).rejects.toThrow();
  });

  it("refuses a slug that is taken, without leaving half a house behind", async () => {
    const before = await db.select({ id: households.id }).from(households);
    await expect(
      createHousehold(db, MASTER_KEY, { slug: "casa-rossi", name: "Un'altra" }),
    ).rejects.toBeInstanceOf(HouseholdSlugTakenError);
    const after = await db.select({ id: households.id }).from(households);
    expect(after).toHaveLength(before.length);
  });

  it("journals the birth and the token — the id, never the secret", async () => {
    await db.delete(auditLog);
    const born = await createHousehold(db, MASTER_KEY, { slug: "casa-verdi", name: "Verdi" });
    const audit = createAuditLog(db);
    await audit.record({
      verb: "household_created",
      outcome: "ok",
      householdId: born.householdId,
      resourceType: "household",
      resourceId: born.householdId,
    });
    await audit.record({
      verb: "token_issued",
      outcome: "ok",
      householdId: born.householdId,
      resourceType: "token",
      resourceId: born.tokenId,
    });

    const rows = await db.select().from(auditLog);
    expect(rows.map((r) => r.verb).sort()).toEqual(["household_created", "token_issued"]);
    expect(JSON.stringify(rows)).not.toContain(born.ownerToken);
  });
});

describe("GET /v1/households", () => {
  it("shows an operator every open house", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/households",
      headers: { authorization: "Bearer operatore" },
    });
    expect(response.statusCode).toBe(200);
    const listed = response.json<{ households: { slug: string; kind: string }[] }>().households;
    const slugs = listed.map((h) => h.slug);
    expect(slugs).toContain("casa-rossi");
    expect(slugs).toContain("casa-verdi");
    // ADR-061: il selettore deve poter dire in quale mondo stai scrivendo
    expect(listed.find((h) => h.slug === "studio-rossi")?.kind).toBe("business");
    expect(listed.find((h) => h.slug === "casa-rossi")?.kind).toBe("home");
  });

  /**
   * Il selettore non deve diventare la finestra da cui una famiglia guarda le
   * altre: il resto del gruppo 5 ha passato giorni a chiudere esattamente
   * questo, e una rotta nuova che elenca tutto lo riaprirebbe in un colpo.
   */
  it("shows a family its own house and nothing else", async () => {
    const [mine] = await db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.slug, "casa-rossi"));
    if (mine === undefined) throw new Error("no house");
    const issued = await issueToken(db, {
      householdId: mine.id,
      role: "owner",
      label: "prova",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/households",
      headers: { authorization: `Bearer ${issued.token}` },
    });
    const houses = response.json<{ households: { slug: string }[] }>().households;
    expect(houses).toHaveLength(1);
    expect(houses[0]?.slug).toBe("casa-rossi");
  });

  it("refuses a caller who said nothing at all", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/households" });
    expect(response.statusCode).toBe(401);
  });
});
