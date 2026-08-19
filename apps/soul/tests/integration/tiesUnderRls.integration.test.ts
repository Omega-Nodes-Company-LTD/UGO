import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient, parcels, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText, unwrapDataKey } from "@ugo/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { ParcelService } from "../../src/services/parcelService.js";
import { TieService } from "../../src/services/tieService.js";

/**
 * ADR-099 sotto il muro acceso — **il test che mancava**.
 *
 * Ogni altro test d'integrazione di questo repo si collega come proprietario
 * delle tabelle, al quale le politiche non si applicano (ADR-019 §75). Dal
 * flip di `DATABASE_URL_APP` (ADR-062 tempo 2b) la produzione gira come
 * `ugo_app`, e per una feature che attraversa le case quella differenza è
 * tutto: senza `withPost` le letture dell'altra casa tornano **vuote, senza
 * un errore** — lo slug a cui si propone, la chiave con cui si cifra, il
 * gosino destinatario. Verde nei test, muta in produzione: il difetto di
 * ADR-045, di nuovo, in un posto nuovo.
 *
 * Questo file si collega come `ugo_app` e cammina il giro intero. Verificato
 * ROSSO togliendo `withPost` dai servizi: «casa-sconosciuta» al primo passo.
 */

const MASTER_KEY = randomBytes(32);
const APP_PASSWORD = "ugo-app-test-password";

let container: StartedPostgreSqlContainer;
/** il proprietario: migrazioni e semina — far nascere case è del mercato */
let owner: DbClient;
/** il ruolo con cui gira la produzione, e l'unico che prova qualcosa qui */
let app: DbClient;
let ties: TieService;
let posta: ParcelService;
let nostra: { accountId: string; gosinoId: string };
let parenti: { accountId: string; gosinoId: string };

beforeAll(async () => {
  const started = await startPostgres();
  container = started.container;
  await runMigrations(started.url);
  owner = createDbClient(started.url);

  nostra = await createAccountWithFounder(owner, MASTER_KEY, {
    slug: "rls-casa-nostra",
    name: "Casa Nostra",
    gosinoName: "Ugo",
  });
  parenti = await createAccountWithFounder(owner, MASTER_KEY, {
    slug: "rls-casa-nonni",
    name: "I Nonni",
    gosinoName: "Nonnino",
  });

  await owner.execute(sql.raw(`ALTER ROLE ugo_app LOGIN PASSWORD '${APP_PASSWORD}'`));
  const appUrl = new URL(started.url);
  appUrl.username = "ugo_app";
  appUrl.password = APP_PASSWORD;
  app = createDbClient(appUrl.toString());

  // i servizi ricevono la connessione dell'APPLICAZIONE, come in produzione
  ties = new TieService(app);
  posta = new ParcelService(app, MASTER_KEY);
}, 240_000);

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
  await container.stop();
});

describe("il giro della posta come ugo_app", () => {
  let tieId: string;

  it("trova la casa a cui si propone: è di un altro, e va vista lo stesso", async () => {
    const done = await ties.propose(nostra.accountId, {
      toAccount: "rls-casa-nonni",
      label: "i nonni",
    });
    // senza `withPost` qui arriva "casa-sconosciuta", ed è il buco intero
    if (typeof done === "string") throw new Error(`la proposta è stata rifiutata: ${done}`);
    tieId = done.id;
  });

  it("legge il nome dell'altra casa nell'elenco, da tutte e due le parti", async () => {
    const mine = await ties.listFor(nostra.accountId);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.otherName).toBe("I Nonni");
    const theirs = await ties.listFor(parenti.accountId);
    expect(theirs[0]?.otherName).toBe("Casa Nostra");
    expect(theirs[0]?.proposedByUs).toBe(false);
  });

  it("accetta, e da lì la porta è aperta", async () => {
    expect(await ties.accept(nostra.accountId, tieId)).toBe("non-tua");
    expect(await ties.accept(parenti.accountId, tieId)).toEqual({ id: tieId });
  });

  it("spedisce davvero, e il testo è cifrato con la chiave di CHI RICEVE", async () => {
    const sent = await posta.send(nostra.accountId, {
      tieId,
      fromGosinoId: nostra.gosinoId,
      toGosinoId: parenti.gosinoId,
      kind: "ricordo",
      text: "oggi siamo stati al parco",
    });
    if (typeof sent === "string") throw new Error(`la cartolina non è partita: ${sent}`);

    const [row] = await owner.select().from(parcels).where(sql`${parcels.id} = ${sent.id}`);
    if (row === undefined) throw new Error("cartolina sparita");
    expect(row.text).not.toContain("parco");
    const [dek] = await owner.execute<{ wrapped_data_key: Buffer }>(
      sql`select wrapped_data_key from accounts where id = ${parenti.accountId}`,
    );
    if (dek === undefined) throw new Error("la casa non ha una DEK");
    expect(decryptText(row.text, unwrapDataKey(dek.wrapped_data_key, MASTER_KEY))).toBe(
      "oggi siamo stati al parco",
    );
    // la consegna è avvenuta nello scope del destinatario, non del mittente
    expect(row.status).toBe("consegnata");
  });

  it("la cassetta si legge in chiaro, e il ricordo si tiene", async () => {
    const inbox = await posta.inbox(parenti.accountId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.text).toBe("oggi siamo stati al parco");
    expect(inbox[0]?.otherName).toBe("Casa Nostra");

    const parcelId = inbox[0]?.id ?? "";
    const kept = await posta.keep(parenti.accountId, parcelId);
    if (typeof kept === "string") throw new Error(`il ricordo non è stato tenuto: ${kept}`);
    const [memory] = await owner.execute<{ text: string; gosino_id: string }>(
      sql`select text, gosino_id from memories where id = ${kept.memoryId}`,
    );
    expect(memory?.gosino_id).toBe(parenti.gosinoId);
    expect(memory?.text).toContain("Casa Nostra");
  });

  it("e il muro regge comunque: il mittente non riapre quello che ha spedito", async () => {
    const outbox = await posta.outbox(nostra.accountId);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.text).toBeUndefined();
  });
});
