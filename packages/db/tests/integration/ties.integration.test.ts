import { startPostgres } from "@ugo/factories";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient, withAccount, type DbClient } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";
import { gosini, accountTies, accounts, parcels } from "../../src/schema/index.js";

/**
 * ADR-099: le due tabelle a due case, provate come `ugo_app` — le politiche
 * non mordono il proprietario delle tabelle (ADR-019 §75), quindi provarle da
 * owner passerebbe senza dimostrare niente.
 *
 * La geometria: tre case. `nostra` propone una parentela a `parenti`;
 * `vicini` non c'entra e non deve vedere NIENTE — né il legame né le
 * cartoline, nemmeno conoscendo gli id.
 */

const APP_PASSWORD = "ugo-app-test-password";

let container: StartedPostgreSqlContainer;
let owner: DbClient;
let app: DbClient;
let nostra: { id: string; gosinoId: string };
let parenti: { id: string; gosinoId: string };
let vicini: { id: string; gosinoId: string };

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

  const house = async (slug: string): Promise<{ id: string; gosinoId: string }> => {
    const [row] = await owner
      .insert(accounts)
      .values({ slug, name: slug })
      .returning({ id: accounts.id });
    if (row === undefined) throw new Error("no account");
    const [exemplar] = await owner
      .insert(gosini)
      .values({ accountId: row.id, name: `ugo-${slug}` })
      .returning({ id: gosini.id });
    if (exemplar === undefined) throw new Error("no exemplar");
    return { id: row.id, gosinoId: exemplar.id };
  };

  nostra = await house("casa-ties-nostra");
  parenti = await house("casa-ties-parenti");
  vicini = await house("casa-ties-vicini");
}, 180_000);

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
  await container.stop();
});

describe("account_ties: il legame lo vedono le due parti, e nessun altro", () => {
  let tieId: string;

  it("lets the proposing house write a proposal for itself", async () => {
    const [row] = await withAccount(app, nostra.id, async (tx) =>
      tx
        .insert(accountTies)
        .values({ fromAccountId: nostra.id, toAccountId: parenti.id, label: "i nonni" })
        .returning({ id: accountTies.id }),
    );
    if (row === undefined) throw new Error("no tie");
    tieId = row.id;
  });

  it("refuses a proposal forged in somebody else's name", async () => {
    await expect(
      withAccount(app, vicini.id, async (tx) =>
        tx
          .insert(accountTies)
          .values({ fromAccountId: nostra.id, toAccountId: vicini.id, label: "cugini?" }),
      ),
    ).rejects.toThrow();
  });

  it("refuses a proposal born already accepted: consent is a gesture, not a default", async () => {
    await expect(
      withAccount(app, nostra.id, async (tx) =>
        tx.insert(accountTies).values({
          fromAccountId: nostra.id,
          toAccountId: vicini.id,
          label: "scorciatoia",
          status: "accettata",
        }),
      ),
    ).rejects.toThrow();
  });

  it("shows the tie to both parties and to nobody else", async () => {
    const mine = await withAccount(app, nostra.id, async (tx) =>
      tx.select({ id: accountTies.id }).from(accountTies),
    );
    const theirs = await withAccount(app, parenti.id, async (tx) =>
      tx.select({ id: accountTies.id }).from(accountTies),
    );
    const blind = await withAccount(app, vicini.id, async (tx) =>
      tx.select({ id: accountTies.id }).from(accountTies),
    );
    expect(mine.map((r) => r.id)).toContain(tieId);
    expect(theirs.map((r) => r.id)).toContain(tieId);
    expect(blind.map((r) => r.id)).not.toContain(tieId);
  });

  it("rejects the crossed counter-proposal while the pair is alive", async () => {
    await expect(
      withAccount(app, parenti.id, async (tx) =>
        tx
          .insert(accountTies)
          .values({ fromAccountId: parenti.id, toAccountId: nostra.id, label: "i nipoti" }),
      ),
    ).rejects.toThrow();
  });

  it("lets the recipient accept, and refuses deletion to everyone", async () => {
    await withAccount(app, parenti.id, async (tx) =>
      tx
        .update(accountTies)
        .set({ status: "accettata", acceptedAt: new Date() })
        .where(sql`${accountTies.id} = ${tieId}`),
    );
    const [after] = await withAccount(app, nostra.id, async (tx) =>
      tx
        .select({ status: accountTies.status })
        .from(accountTies)
        .where(sql`${accountTies.id} = ${tieId}`),
    );
    expect(after?.status).toBe("accettata");

    await expect(
      withAccount(app, nostra.id, async (tx) =>
        tx.delete(accountTies).where(sql`${accountTies.id} = ${tieId}`),
      ),
    ).rejects.toThrow();
  });

  it("allows a fresh proposal once the old pair is revoked", async () => {
    await withAccount(app, nostra.id, async (tx) =>
      tx
        .update(accountTies)
        .set({ status: "revocata", revokedAt: new Date() })
        .where(sql`${accountTies.id} = ${tieId}`),
    );
    const [again] = await withAccount(app, parenti.id, async (tx) =>
      tx
        .insert(accountTies)
        .values({ fromAccountId: parenti.id, toAccountId: nostra.id, label: "ripensamento" })
        .returning({ id: accountTies.id }),
    );
    expect(again?.id).toBeDefined();
    // e si richiude, per lasciare la coppia libera al banco delle cartoline
    await withAccount(app, parenti.id, async (tx) =>
      tx
        .update(accountTies)
        .set({ status: "revocata", revokedAt: new Date() })
        .where(sql`${accountTies.id} = ${again?.id}`),
    );
  });
});

describe("parcels: la cartolina la vedono mittente e destinatario", () => {
  let tieId: string;
  let parcelId: string;

  beforeAll(async () => {
    const [tie] = await withAccount(app, nostra.id, async (tx) =>
      tx
        .insert(accountTies)
        .values({ fromAccountId: nostra.id, toAccountId: parenti.id, label: "i nonni bis" })
        .returning({ id: accountTies.id }),
    );
    if (tie === undefined) throw new Error("no tie");
    tieId = tie.id;
    await withAccount(app, parenti.id, async (tx) =>
      tx
        .update(accountTies)
        .set({ status: "accettata", acceptedAt: new Date() })
        .where(sql`${accountTies.id} = ${tieId}`),
    );
  });

  it("lets the sender post and the recipient read; the neighbour sees nothing", async () => {
    const [sent] = await withAccount(app, nostra.id, async (tx) =>
      tx
        .insert(parcels)
        .values({
          tieId,
          fromAccountId: nostra.id,
          toAccountId: parenti.id,
          fromGosinoId: nostra.gosinoId,
          toGosinoId: parenti.gosinoId,
          kind: "messaggio",
          text: "v1:ciphertext-di-prova",
        })
        .returning({ id: parcels.id }),
    );
    if (sent === undefined) throw new Error("no parcel");
    parcelId = sent.id;

    const inbox = await withAccount(app, parenti.id, async (tx) =>
      tx.select({ id: parcels.id }).from(parcels),
    );
    expect(inbox.map((r) => r.id)).toContain(parcelId);

    const blind = await withAccount(app, vicini.id, async (tx) =>
      tx.execute(sql`select id from parcels where id = ${parcelId}`),
    );
    expect(blind).toHaveLength(0);
  });

  it("refuses a parcel posted in another house's name", async () => {
    await expect(
      withAccount(app, vicini.id, async (tx) =>
        tx.insert(parcels).values({
          tieId,
          fromAccountId: nostra.id,
          toAccountId: parenti.id,
          fromGosinoId: nostra.gosinoId,
          kind: "messaggio",
          text: "v1:contraffatta",
        }),
      ),
    ).rejects.toThrow();
  });

  it("lets only the recipient mark delivery, and nobody rewrite the text", async () => {
    // il mittente non può toccare la consegna: la policy di UPDATE è del destinatario
    const senderTouch = await withAccount(app, nostra.id, async (tx) =>
      tx
        .update(parcels)
        .set({ status: "consegnata" })
        .where(sql`${parcels.id} = ${parcelId}`)
        .returning({ id: parcels.id }),
    );
    expect(senderTouch).toHaveLength(0);

    await withAccount(app, parenti.id, async (tx) =>
      tx
        .update(parcels)
        .set({ status: "consegnata", deliveredAt: new Date() })
        .where(sql`${parcels.id} = ${parcelId}`),
    );
    const [row] = await withAccount(app, parenti.id, async (tx) =>
      tx
        .select({ status: parcels.status })
        .from(parcels)
        .where(sql`${parcels.id} = ${parcelId}`),
    );
    expect(row?.status).toBe("consegnata");

    // il testo è fuori dal GRANT di UPDATE: nemmeno il destinatario lo riscrive
    await expect(
      withAccount(app, parenti.id, async (tx) =>
        tx
          .update(parcels)
          .set({ text: "riscritta" })
          .where(sql`${parcels.id} = ${parcelId}`),
      ),
    ).rejects.toThrow();
  });

  it("refuses deletion: a postcard that vanishes never existed", async () => {
    await expect(
      withAccount(app, parenti.id, async (tx) =>
        tx.delete(parcels).where(sql`${parcels.id} = ${parcelId}`),
      ),
    ).rejects.toThrow();
  });
});

/**
 * ADR-099 §6: il ruolo della posta, e quanto è **stretto**.
 *
 * ADR-097 chiama i grants «l'inventario leggibile di cosa il mercato è». Un
 * inventario che nessuno conta è una dichiarazione d'intenti: qui si conta.
 * Il ruolo deve poter fare esattamente il suo mestiere — vedere la casa a cui
 * si spedisce e la sua chiave avvolta — e sbattere contro tutto il resto.
 */
describe("ugo_post: il blast radius è la posta, non la casa", () => {
  /** come `withPost`, ma dal client di prova: `SET LOCAL ROLE` in transazione */
  const asPost = async <T>(work: (tx: DbClient) => Promise<T>): Promise<T> =>
    app.transaction(async (tx) => {
      await tx.execute(sql`set local role ugo_post`);
      return work(tx as unknown as DbClient);
    });

  it("vede la casa a cui si spedisce, e la sua chiave AVVOLTA", async () => {
    const rows = await asPost((tx) =>
      tx.execute<{ slug: string }>(
        sql`select slug, name, wrapped_data_key from accounts where id = ${parenti.id}`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("casa-ties-parenti");
  });

  it("NON vede il resto della riga: il budget non è affare della posta", async () => {
    await expect(
      asPost((tx) => tx.execute(sql`select daily_budget_usd from accounts limit 1`)),
    ).rejects.toThrow();
    await expect(
      asPost((tx) => tx.execute(sql`select metabolism from accounts limit 1`)),
    ).rejects.toThrow();
  });

  it("NON tocca ciò che non è suo: clienti, ricordi in lettura, audit", async () => {
    await expect(asPost((tx) => tx.execute(sql`select id from customers limit 1`))).rejects.toThrow();
    // può SCRIVERE un ricordo (il «tienilo»), non leggerne uno
    await expect(asPost((tx) => tx.execute(sql`select text from memories limit 1`))).rejects.toThrow();
    await expect(asPost((tx) => tx.execute(sql`select id from audit_log limit 1`))).rejects.toThrow();
    await expect(
      asPost((tx) => tx.execute(sql`select payload from recognition_profiles limit 1`)),
    ).rejects.toThrow();
  });

  /**
   * `WITH INHERIT FALSE`: il ruolo si assume, non si porta addosso. La prova
   * va fatta dove il muro c'è davvero — **non** su `accounts`, che ADR-048
   * lascia leggibile a tutti per costruzione (`accounts_read USING (true)`:
   * risolvere un token precede il sapere di che casa si parla). È il motivo
   * per cui i grants del ruolo su `accounts` sono per COLONNA: dentro la
   * porta la posta vede meno, non di più.
   */
  it("non si porta addosso: senza SET ROLE l'esemplare altrui resta invisibile", async () => {
    const asPostSees = await asPost((tx) =>
      tx.execute(sql`select id from gosini where account_id = ${parenti.id}`),
    );
    expect(asPostSees.length).toBeGreaterThan(0);

    // la stessa query dallo scope di casa nostra, senza assumere il ruolo
    const blind = await withAccount(app, nostra.id, (tx) =>
      tx.execute(sql`select id from gosini where account_id = ${parenti.id}`),
    );
    expect(blind).toHaveLength(0);
  });
});
