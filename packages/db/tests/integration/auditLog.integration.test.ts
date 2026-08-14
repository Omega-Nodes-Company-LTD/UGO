import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startPostgres } from "@ugo/factories";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import { auditLog, gosini, households } from "../../src/schema/index.js";

/**
 * ADR-049: il giornale che nessuno può riscrivere.
 *
 * Il punto di questo file non è che l'`insert` funzioni — quello lo dice ogni
 * altro test. È che `UPDATE` e `DELETE` **falliscano**, e che a farli fallire
 * sia Postgres e non una convenzione del codice. Un audit log che
 * l'applicazione può correggere non è un audit log, è un suggerimento, e la
 * differenza si vede solo il giorno in cui qualcuno prova a correggerlo.
 *
 * Si collega come `ugo_app`, perché i privilegi non si applicano al
 * proprietario delle tabelle: girare questo come utente delle migrazioni
 * passerebbe senza dimostrare niente (ADR-048 §7, stessa trappola).
 */

const APP_PASSWORD = "ugo-audit-test-password";

let container: StartedPostgreSqlContainer;
/** il proprietario: migrazioni, semina, e la scadenza a dodici mesi */
let owner: DbClient;
/** il ruolo applicativo, quello a cui i privilegi mordono davvero */
let app: DbClient;
let casa: string;

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

  const [row] = await owner
    .insert(households)
    .values({ slug: "casa-audit", name: "casa-audit" })
    .returning({ id: households.id });
  if (row === undefined) throw new Error("no household");
  casa = row.id;
  await owner.insert(gosini).values({ householdId: casa, name: "ugo-audit" });
}, 180_000);

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
  await container.stop();
});

describe("audit_log", () => {
  it("takes a row that says who did what, with no name in it", async () => {
    await owner.insert(auditLog).values({
      householdId: casa,
      tokenId: "00000000-0000-4000-8000-00000000dead",
      role: "owner",
      verb: "export",
      resourceType: "household",
      resourceId: casa,
      outcome: "ok",
    });

    const [row] = await owner.select().from(auditLog).where(eq(auditLog.verb, "export"));
    expect(row?.outcome).toBe("ok");
    expect(row?.at).toBeInstanceOf(Date);
    // le colonne che ci sono sono tutte id, verbi ed esiti: non esiste un posto
    // dove infilare un nome, ed e' il punto (regola 6)
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "at",
      "householdId",
      "id",
      "outcome",
      "resourceId",
      "resourceType",
      "role",
      "tokenId",
      "verb",
    ]);
  });

  /**
   * Un 401 avviene prima che si sappia di che casa si tratti. Se la colonna
   * fosse obbligatoria, l'evento per cui un audit log esiste sarebbe l'unico
   * che non si può registrare.
   */
  it("records a refusal that belongs to no house at all", async () => {
    await app.insert(auditLog).values({
      verb: "denied",
      outcome: "denied",
      resourceType: "route",
      resourceId: "/v1/privacy/export",
    });
    const [row] = await owner.select().from(auditLog).where(eq(auditLog.verb, "denied"));
    expect(row?.householdId).toBeNull();
    expect(row?.tokenId).toBeNull();
  });

  it("refuses to let the application rewrite what it wrote", async () => {
    await expect(
      app.update(auditLog).set({ outcome: "ok" }).where(eq(auditLog.verb, "denied")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("refuses to let the application delete what it wrote", async () => {
    await expect(app.delete(auditLog).where(eq(auditLog.verb, "denied"))).rejects.toThrow(
      /permission denied/i,
    );
    // e la riga e' ancora li': il rifiuto non era cosmetico
    const rows = await owner.select().from(auditLog).where(eq(auditLog.verb, "denied"));
    expect(rows).toHaveLength(1);
  });

  /**
   * La retention deve restare possibile, o dodici mesi sarebbero per sempre.
   * A poterla applicare è il proprietario, che è chi esegue i job notturni —
   * far scadere una riga è un atto della casa, riscriverla sarebbe un atto
   * dell'applicazione, e sono due poteri diversi.
   */
  it("still lets the owner expire a row older than the retention", async () => {
    await owner.insert(auditLog).values({
      householdId: casa,
      verb: "forget",
      outcome: "ok",
      at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });
    const removed = await owner.execute(
      sql`delete from audit_log where at < now() - make_interval(days => 365)`,
    );
    expect(removed).toBeDefined();
    const left = await owner.select().from(auditLog).where(eq(auditLog.verb, "forget"));
    expect(left).toHaveLength(0);
  });
});
