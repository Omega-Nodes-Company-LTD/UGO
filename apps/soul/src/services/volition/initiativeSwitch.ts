import { accounts, type DbClient } from "@ugo/db";
import { eq, isNotNull } from "drizzle-orm";

/**
 * The switch that stops him starting things (ADR-034, riscritto da ADR-104).
 *
 * ADR-034 lo teneva **in memoria e per processo**, con una ragione dichiarata:
 * un silenzio chiesto alle undici di sera non deve essere ancora in vigore la
 * settimana dopo senza che nessuno ricordi perché. La ragione era buona e la
 * forma no, e con due case è diventata un difetto vero: l'oggetto era **uno
 * solo**, quindi spegnere l'iniziativa da una casa la spegneva **a tutte** —
 * il vicino smetteva di ricevere una parola e nessuno poteva sapere perché.
 *
 * ADR-104 la scrive sulla riga della casa e tiene tre stati invece di due:
 *
 * - `true` / `false` — **questa casa ha deciso**, e la decisione sopravvive al
 *   riavvio;
 * - `null` — non deciso qui, e l'ultima parola resta a `UGO_INITIATIVE`.
 *
 * La preoccupazione di ADR-034 non si risolve dimenticando la scelta: si
 * risolve **facendola vedere**. Il pannello dice sempre in che stato è, chi
 * l'ha deciso, e come restituire la parola al server — un silenzio che non si
 * vede è il problema, non un silenzio che dura.
 *
 * **Limite dichiarato**: la mappa è la cache di questo processo. Con più
 * repliche di soul, una scelta fatta su una arriva alle altre al loro prossimo
 * avvio. Oggi il processo è uno; il giorno che non lo sarà, questa riga è il
 * posto da cui ripartire (stessa onestà della mappa dei chioschi, ADR-102).
 */
export class InitiativeSwitch {
  /** solo le case che hanno DECISO: assente ≠ spento */
  private readonly decided = new Map<string, boolean>();

  public constructor(private readonly fromEnv: () => boolean) {}

  public on(accountId?: string): boolean {
    if (accountId !== undefined) {
      const chosen = this.decided.get(accountId);
      if (chosen !== undefined) return chosen;
    }
    return this.fromEnv();
  }

  /**
   * Ciò che il pannello mostra: lo stato, e **da dove viene**.
   *
   * Legge la riga, non la cache. La cache serve al tick dell'iniziativa, che
   * è sincrono e gira ogni pochi secondi; il pannello può permettersi una
   * query e in cambio non mente mai — se un altro processo ha cambiato idea,
   * qui si vede subito invece che al prossimo riavvio.
   */
  public async stateOf(
    db: DbClient,
    accountId: string,
  ): Promise<{ enabled: boolean; overridden: boolean; fromEnv: boolean }> {
    const [row] = await db
      .select({ initiative: accounts.initiative })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    const chosen = row?.initiative ?? null;
    // rimettersi in pari costa niente e chiude la finestra fra due processi
    this.remember(accountId, chosen);
    return {
      enabled: chosen ?? this.fromEnv(),
      overridden: chosen !== null,
      fromEnv: this.fromEnv(),
    };
  }

  /** Aggiorna la cache dopo una scrittura; `null` restituisce la parola all'env. */
  public remember(accountId: string, value: boolean | null): void {
    if (value === null) this.decided.delete(accountId);
    else this.decided.set(accountId, value);
  }

  /**
   * Rilegge le case che hanno deciso.
   *
   * Si chiama all'avvio e dopo ogni scrittura. Legge **solo le righe decise**
   * (`initiative is not null`): una casa che non si è mai espressa non deve
   * occupare posto nella mappa, o «assente» smetterebbe di voler dire «non
   * deciso».
   */
  public async load(db: DbClient): Promise<void> {
    const rows = await db
      .select({ id: accounts.id, initiative: accounts.initiative })
      .from(accounts)
      .where(isNotNull(accounts.initiative));
    this.decided.clear();
    for (const row of rows) {
      if (row.initiative !== null) this.decided.set(row.id, row.initiative);
    }
  }

  /** Scrive la scelta della casa, e allinea la cache. Torna lo stato nuovo. */
  public async choose(
    db: DbClient,
    accountId: string,
    value: boolean | null,
  ): Promise<{ enabled: boolean; overridden: boolean; fromEnv: boolean }> {
    await db.update(accounts).set({ initiative: value }).where(eq(accounts.id, accountId));
    this.remember(accountId, value);
    return {
      enabled: value ?? this.fromEnv(),
      overridden: value !== null,
      fromEnv: this.fromEnv(),
    };
  }
}
