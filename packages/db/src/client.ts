import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type DbClient = ReturnType<typeof createDbClient>;

/**
 * Typed Drizzle client over postgres-js. The pool is owned by the caller:
 * close it with `db.$client.end()` on shutdown (and in test afterAll hooks —
 * TESTING_PLAYBOOK §7, no hanging processes).
 */
export function createDbClient(databaseUrl: string): ReturnType<typeof buildClient> {
  return buildClient(databaseUrl);
}

function buildClient(databaseUrl: string, accountId?: string) {
  const pool = postgres(databaseUrl, {
    // fail fast on an unreachable database instead of queueing forever
    connect_timeout: 10,
    ...(accountId !== undefined && {
      // ADR-098: la casa nel PACCHETTO DI STARTUP — il server la applica a
      // ogni sessione del pool, riconnessioni comprese. Non c'è finestra in
      // cui una connessione esista senza la sua casa
      connection: { "app.account_id": accountId },
    }),
  });
  return drizzle(pool, { schema, casing: "snake_case" });
}

/**
 * ADR-098: la connessione della casa — per i runtime legati a UN account
 * (ADR-032). `app.account_id` è dichiarato alla stretta di mano della
 * connessione: ogni query di questo client è già dentro il muro, senza
 * transazioni per unità di lavoro. Per le rotte, che servono più case dalla
 * stessa connessione, resta `withAccount`.
 */
export function createScopedDbClient(
  databaseUrl: string,
  accountId: string,
): ReturnType<typeof buildClient> {
  return buildClient(databaseUrl, accountId);
}

/**
 * Runs `work` inside a transaction that has declared which house it is about
 * (ADR-048). This is the only place `app.account_id` is ever set, and the
 * only thing the Row Level Security policies read.
 *
 * **`SET LOCAL`, not `SET`.** The pool reuses connections: a plain `SET` would
 * outlive the request and the next one would inherit the previous caller's
 * house — which is precisely the failure RLS exists to make impossible. `SET
 * LOCAL` is undone when the transaction ends, whether it commits or not.
 *
 * The value is passed as a bound parameter rather than interpolated: it
 * arrives from a request, and `set_config` takes it as data instead of as SQL.
 */
export async function withAccount<T>(
  db: DbClient,
  accountId: string,
  work: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`);
    return work(tx as unknown as DbClient);
  });
}

/**
 * ADR-097: la transazione del mercato.
 *
 * `SET LOCAL ROLE ugo_market` — e al commit il ruolo torna quello di prima,
 * con la stessa garanzia di `withAccount`: il pool riusa le connessioni, e un
 * `SET ROLE` senza LOCAL sopravviverebbe alla richiesta. Questo è l'UNICO
 * punto del codice che assume il ruolo; le rotte del mercato (vetrina,
 * adozione, cessione, fondazione — ADR-081/082/083/084) entrano da qui e
 * tutto il resto di soul non sa nemmeno che esiste.
 *
 * Il ruolo non è un bypass: può toccare solo le tabelle e i comandi che le
 * politiche `TO ugo_market` della migrazione 0049 elencano — l'inventario
 * leggibile di cosa il mercato è.
 */
export async function withMarket<T>(db: DbClient, work: (tx: DbClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role ugo_market`);
    return work(tx as unknown as DbClient);
  });
}

/**
 * ADR-099: la transazione della posta.
 *
 * Fratello di `withMarket` (ADR-097) e nato dalla stessa scoperta: le
 * parentele fra le case sono la QUINTA superficie che attraversa il confine
 * per disegno, e sotto `ugo_app` si romperebbero in silenzio — lo slug della
 * casa destinataria, la sua chiave per ri-cifrare la cartolina, il suo
 * esemplare: tutto invisibile dallo scope del mittente, senza un errore.
 *
 * `SET LOCAL ROLE ugo_post`, perso al commit, e questo è l'UNICO punto che lo
 * assume: le parentele e le cartoline entrano da qui, tutto il resto di soul
 * non sa che il ruolo esiste. Cosa può toccare lo elencano le politiche
 * `TO ugo_post` della migrazione 0052, ed è tutto ciò che la posta è.
 */
export async function withPost<T>(db: DbClient, work: (tx: DbClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role ugo_post`);
    return work(tx as unknown as DbClient);
  });
}
