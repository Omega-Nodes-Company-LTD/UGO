import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startPostgres } from "@ugo/factories";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient, createScopedDbClient, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import { accounts, gosini } from "../../src/schema/index.js";

/**
 * ADR-098: la connessione della casa.
 *
 * Un runtime è legato a UN account per costruzione (ADR-032): invece di
 * avvolgere ogni query in una transazione che dichiara la casa, la casa si
 * dichiara UNA volta, nel pacchetto di startup della connessione — il server
 * la applica a ogni sessione del pool, riconnessioni comprese. Le politiche
 * RLS leggono `app.account_id` e non gli importa da dove arrivi.
 *
 * Il test gira come `ugo_app`, che è l'unico posto dove il muro morde.
 */

const APP_PASSWORD = "ugo-scoped-client-test";

let container: StartedPostgreSqlContainer;
let owner: DbClient;
let mineId = "";
let theirsId = "";
let appUrl = "";

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  owner = createDbClient(pg.url);
  await owner.execute(sql.raw(`ALTER ROLE ugo_app LOGIN PASSWORD '${APP_PASSWORD}'`));
  const url = new URL(pg.url);
  url.username = "ugo_app";
  url.password = APP_PASSWORD;
  appUrl = url.toString();

  const rows = await owner
    .insert(accounts)
    .values([
      { slug: "casa-scoped-mia", name: "mia" },
      { slug: "casa-scoped-loro", name: "loro" },
    ])
    .returning({ id: accounts.id });
  const [mine, theirs] = rows;
  if (mine === undefined || theirs === undefined) throw new Error("case non piantate");
  mineId = mine.id;
  theirsId = theirs.id;
  await owner.insert(gosini).values([
    { accountId: mineId, name: "ugo-mio" },
    { accountId: theirsId, name: "ugo-loro" },
  ]);
}, 180_000);

afterAll(async () => {
  await owner.$client.end();
  await container.stop();
});

describe("createScopedDbClient", () => {
  it("vede la propria casa e non il vicino, senza nessuna transazione", async () => {
    const home = createScopedDbClient(appUrl, mineId);
    try {
      const names = (await home.select({ name: gosini.name }).from(gosini)).map((r) => r.name);
      expect(names).toContain("ugo-mio");
      expect(names).not.toContain("ugo-loro");
    } finally {
      await home.$client.end();
    }
  });

  it("la casa dichiarata sopravvive a più sessioni del pool", async () => {
    const home = createScopedDbClient(appUrl, mineId);
    try {
      // più giri concorrenti = più connessioni del pool: ognuna deve nascere
      // già dentro la casa, non solo la prima
      const rounds = await Promise.all(
        Array.from({ length: 8 }, () =>
          home.execute(sql`select current_setting('app.account_id', true) as casa`),
        ),
      );
      for (const round of rounds) {
        expect((round as unknown as { casa: string }[])[0]?.casa).toBe(mineId);
      }
    } finally {
      await home.$client.end();
    }
  });

  it("scrivere fuori casa viene rifiutato dal WITH CHECK, non dalla buona volontà", async () => {
    const home = createScopedDbClient(appUrl, mineId);
    try {
      let refused = false;
      try {
        await home.insert(gosini).values({ accountId: theirsId, name: "intruso" });
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
    } finally {
      await home.$client.end();
    }
  });
});
