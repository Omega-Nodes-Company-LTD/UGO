import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startPostgres } from "@ugo/factories";
import { PROP_KINDS } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient, withHousehold, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import { households, placedProps, PROP_KINDS_IN_DB, propStock, rooms } from "../../src/schema/index.js";

/**
 * ADR-056: gli arredi nascono **dentro** il muro fra le case.
 *
 * Il punto di questo file è la migrazione `0017`, scritta a mano. drizzle-kit
 * non modella le politiche, quindi una tabella nuova nasce senza RLS e senza
 * che nessuno se ne accorga: `SELECT` funziona, i test funzionano, il pannello
 * funziona — e il vicino vede il tuo cuscino. Una tabella scoperta si comporta
 * esattamente come una coperta finché non c'è una seconda famiglia, che è la
 * ragione per cui va dimostrato adesso e non quando arriva.
 *
 * Si collega come `ugo_app`, perché le politiche non si applicano al
 * proprietario delle tabelle: girare questo come utente delle migrazioni
 * passerebbe senza dimostrare niente (ADR-048 §7, la stessa trappola).
 */

const APP_PASSWORD = "ugo-props-test-password";

let container: StartedPostgreSqlContainer;
let owner: DbClient;
let app: DbClient;
let mine = "";
let theirs = "";

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  owner = createDbClient(pg.url);

  await owner.execute(sql.raw(`ALTER ROLE ugo_app LOGIN PASSWORD '${APP_PASSWORD}'`));
  const appUrl = new URL(pg.url);
  appUrl.username = "ugo_app";
  appUrl.password = APP_PASSWORD;
  app = createDbClient(appUrl.toString());

  const born = await owner
    .insert(households)
    .values([
      { slug: "casa-mia", name: "mia" },
      { slug: "casa-loro", name: "loro" },
    ])
    .returning({ id: households.id, slug: households.slug });
  mine = born.find((h) => h.slug === "casa-mia")?.id ?? "";
  theirs = born.find((h) => h.slug === "casa-loro")?.id ?? "";

  for (const [householdId, slug] of [
    [mine, "cucina"],
    [theirs, "cucina"],
  ] as const) {
    await owner.insert(rooms).values({ householdId, name: "Cucina", slug });
    await owner
      .insert(placedProps)
      .values({ householdId, roomSlug: slug, kind: "cushion", x: 0.2, z: -0.3 });
  }
}, 180_000);

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
  await container.stop();
});

describe("placed_props", () => {
  /**
   * Due case, la stessa stanza, lo stesso nome: «cucina» è il nome di stanza
   * più probabile che esista, quindi è anche il caso in cui una politica
   * mancante si vede per primo.
   */
  it("shows a house its own furniture and nobody else's", async () => {
    const seen = await withHousehold(app, mine, async (tx) =>
      tx.select({ id: placedProps.id, house: placedProps.householdId }).from(placedProps),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.house).toBe(mine);
  });

  it("refuses to place furniture in somebody else's house", async () => {
    await expect(
      withHousehold(app, mine, async (tx) =>
        tx
          .insert(placedProps)
          .values({ householdId: theirs, roomSlug: "cucina", kind: "ball", x: 0, z: 0 }),
      ),
    ).rejects.toBeDefined();
  });

  it("refuses to move a neighbour's cushion, and does not say it does not exist", async () => {
    const moved = await withHousehold(app, mine, async (tx) =>
      tx
        .update(placedProps)
        .set({ x: 0.9 })
        .where(eq(placedProps.householdId, theirs))
        .returning({ id: placedProps.id }),
    );
    // zero righe e non un errore: la politica rende la riga *invisibile*, che è
    // la stessa risposta che darebbe una riga inesistente — e va bene così,
    // perché è precisamente ciò che non fa trapelare che esiste (BOLA)
    expect(moved).toHaveLength(0);
  });

  /**
   * Il `check` in SQL duplica `PROP_KINDS`, ed è voluto (il vincolo deve vivere
   * nel database). Questa è la riga che paga la duplicazione: il giorno che il
   * catalogo cresce e la migrazione no, il rifiuto arriva qui e non in
   * produzione davanti a un pannello che dice «non valido» senza spiegare.
   */
  it("keeps the database's idea of a prop and the catalogue's identical", () => {
    expect([...PROP_KINDS_IN_DB].sort()).toEqual([...PROP_KINDS].sort());
  });

  it("refuses a kind nobody can draw", async () => {
    await expect(
      owner
        .insert(placedProps)
        .values({ householdId: mine, roomSlug: "cucina", kind: "divano", x: 0, z: 0 }),
    ).rejects.toBeDefined();
  });

  it("refuses a position outside the room", async () => {
    await expect(
      owner
        .insert(placedProps)
        .values({ householdId: mine, roomSlug: "cucina", kind: "ball", x: 4, z: 0 }),
    ).rejects.toBeDefined();
  });
});

describe("prop_stock", () => {
  it("is scoped to the house like everything else", async () => {
    await owner
      .insert(propStock)
      .values([
        { householdId: mine, kind: "ball", remaining: 2, refillPerWeek: 2 },
        { householdId: theirs, kind: "ball", remaining: 9 },
      ]);
    const seen = await withHousehold(app, mine, async (tx) =>
      tx.select({ remaining: propStock.remaining }).from(propStock),
    );
    expect(seen).toEqual([{ remaining: 2 }]);
  });

  it("refuses to go below zero: a scorta is not a debt", async () => {
    await expect(
      owner.execute(sql`update prop_stock set remaining = -1 where household_id = ${mine}`),
    ).rejects.toBeDefined();
  });
});
