import { accountTies, accounts, withAccount, withPost, type DbClient } from "@ugo/db";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

/**
 * La parentela fra le case (ADR-099): proposta da una casa, vera solo quando
 * l'altra accetta, revocabile da ciascuna delle due in silenzio.
 *
 * **Due porte, e la differenza conta** (ADR-099, dopo il flip di ADR-062
 * tempo 2b). Ogni SCRITTURA passa da `withAccount` con la casa che compie
 * l'atto: la policy pretende che chi propone sia il mittente, e resta la
 * difesa forte. Ogni LETTURA che attraversa il confine — lo slug della casa a
 * cui si propone, il nome dell'altra parte — passa da `withPost`: sotto
 * `ugo_app` quelle righe semplicemente non esistono, e senza la porta questo
 * servizio risponderebbe «casa sconosciuta» a ogni parentela del mondo.
 */

export type TieRefusal =
  | "casa-sconosciuta"
  | "se-stessa"
  | "gia-legate"
  | "non-esiste"
  | "non-tua"
  | "non-in-proposta"
  | "gia-revocata";

export interface TieView {
  id: string;
  /** l'altra casa, vista da chi guarda: slug e nome, mai di più */
  otherSlug: string;
  otherName: string;
  label: string;
  status: string;
  /** true se la proposta l'abbiamo fatta noi */
  proposedByUs: boolean;
  proposedAt: Date;
  acceptedAt: Date | null;
  /** l'essere di casa NOSTRA che rappresenta l'altra famiglia, se indicato */
  ourBeingId: string | null;
}

export class TieService {
  public constructor(private readonly db: DbClient) {}

  /** slug o uuid, come la cessione (ADR-082): chi propone non sfoglia elenchi */
  private async resolveAccount(asked: string): Promise<string | undefined> {
    const trimmed = asked.trim();
    const byId = z.uuid().safeParse(trimmed).success ? eq(accounts.id, trimmed) : undefined;
    // la casa a cui si propone è di qualcun altro per definizione: senza
    // `withPost` questa select torna sempre vuota, e sempre in silenzio
    const [row] = await withPost(this.db, (tx) =>
      tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(isNull(accounts.closedAt), or(eq(accounts.slug, trimmed.toLowerCase()), byId))),
    );
    return row?.id;
  }

  public async propose(
    fromAccountId: string,
    input: { toAccount: string; label: string; fromBeingId?: string | undefined },
  ): Promise<{ id: string } | TieRefusal> {
    const toAccountId = await this.resolveAccount(input.toAccount);
    if (toAccountId === undefined) return "casa-sconosciuta";
    if (toAccountId === fromAccountId) return "se-stessa";

    // il rifiuto parlato prima del vincolo: l'indice unico (0049) direbbe la
    // stessa cosa, ma con le parole di Postgres invece che con le nostre
    const [alive] = await withPost(this.db, (tx) =>
      tx
        .select({ id: accountTies.id })
        .from(accountTies)
      .where(
        and(
          ne(accountTies.status, "revocata"),
          or(
            and(
              eq(accountTies.fromAccountId, fromAccountId),
              eq(accountTies.toAccountId, toAccountId),
            ),
            and(
              eq(accountTies.fromAccountId, toAccountId),
              eq(accountTies.toAccountId, fromAccountId),
            ),
          ),
        ),
      ),
    );
    if (alive !== undefined) return "gia-legate";

    const created = await withAccount(this.db, fromAccountId, async (tx) => {
      const [row] = await tx
        .insert(accountTies)
        .values({
          fromAccountId,
          toAccountId,
          label: input.label.trim(),
          ...(input.fromBeingId !== undefined && { fromBeingId: input.fromBeingId }),
        })
        .returning({ id: accountTies.id });
      return row;
    });
    if (created === undefined) throw new Error("la parentela non è stata scritta");
    return { id: created.id };
  }

  public async accept(
    accountId: string,
    tieId: string,
    toBeingId?: string,
  ): Promise<{ id: string } | TieRefusal> {
    const [tie] = await withPost(this.db, (tx) =>
      tx
        .select({ to: accountTies.toAccountId, status: accountTies.status })
        .from(accountTies)
        .where(eq(accountTies.id, tieId)),
    );
    if (tie === undefined) return "non-esiste";
    // accettare tocca SOLO al destinatario della proposta
    if (tie.to !== accountId) return "non-tua";
    if (tie.status !== "proposta") return "non-in-proposta";

    await withAccount(this.db, accountId, (tx) =>
      tx
        .update(accountTies)
        .set({
          status: "accettata",
          acceptedAt: new Date(),
          ...(toBeingId !== undefined && { toBeingId }),
        })
        .where(eq(accountTies.id, tieId)),
    );
    return { id: tieId };
  }

  public async revoke(accountId: string, tieId: string): Promise<{ id: string } | TieRefusal> {
    const [tie] = await withPost(this.db, (tx) =>
      tx
        .select({
          from: accountTies.fromAccountId,
          to: accountTies.toAccountId,
          status: accountTies.status,
        })
        .from(accountTies)
        .where(eq(accountTies.id, tieId)),
    );
    if (tie === undefined) return "non-esiste";
    if (tie.from !== accountId && tie.to !== accountId) return "non-tua";
    if (tie.status === "revocata") return "gia-revocata";

    await withAccount(this.db, accountId, (tx) =>
      tx
        .update(accountTies)
        .set({ status: "revocata", revokedAt: new Date() })
        .where(eq(accountTies.id, tieId)),
    );
    return { id: tieId };
  }

  /** Le parentele di una casa, con l'altra parte detta per nome e non per id. */
  public async listFor(accountId: string): Promise<TieView[]> {
    const rows = await withPost(this.db, (tx) =>
      tx
        .select()
        .from(accountTies)
        .where(
          or(eq(accountTies.fromAccountId, accountId), eq(accountTies.toAccountId, accountId)),
        )
        .orderBy(accountTies.proposedAt),
    );
    if (rows.length === 0) return [];

    const otherIds = rows.map((row) =>
      row.fromAccountId === accountId ? row.toAccountId : row.fromAccountId,
    );
    // i nomi sono delle ALTRE case: è il motivo per cui esiste `withPost`
    const names = await withPost(this.db, (tx) =>
      tx
        .select({ id: accounts.id, slug: accounts.slug, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, otherIds)),
    );
    const byId = new Map(names.map((house) => [house.id, house]));

    return rows.map((row) => {
      const proposedByUs = row.fromAccountId === accountId;
      const other = byId.get(proposedByUs ? row.toAccountId : row.fromAccountId);
      return {
        id: row.id,
        otherSlug: other?.slug ?? "?",
        otherName: other?.name ?? "?",
        label: row.label,
        status: row.status,
        proposedByUs,
        proposedAt: row.proposedAt,
        acceptedAt: row.acceptedAt,
        ourBeingId: proposedByUs ? row.fromBeingId : row.toBeingId,
      };
    });
  }

  /**
   * La parentela VIVA verso una casa nominata per slug, nome della casa o
   * etichetta («i nonni»): è quello che il gesto in chat ha in mano. Le
   * revocate non contano — per il gesto, quella casa è tornata un'estranea.
   */
  public async tieByName(
    accountId: string,
    name: string,
  ): Promise<
    { id: string; otherAccountId: string; otherName: string; status: string } | undefined
  > {
    // senza l'articolo davanti: il gesto dice «manda AI nonni», l'etichetta
    // dice «i nonni», e sarebbe crudele che la differenza fosse un articolo
    const plain = (value: string): string =>
      value
        .trim()
        .toLowerCase()
        .replace(/^(il|lo|la|i|gli|le|l')\s*/u, "");
    const wanted = plain(name);
    if (wanted === "") return undefined;
    const ties = await this.listFor(accountId);
    const match = ties.find(
      (tie) =>
        tie.status !== "revocata" &&
        (plain(tie.otherSlug) === wanted ||
          plain(tie.otherName) === wanted ||
          plain(tie.label) === wanted),
    );
    if (match === undefined) return undefined;
    const [row] = await withPost(this.db, (tx) =>
      tx
        .select({ from: accountTies.fromAccountId, to: accountTies.toAccountId })
        .from(accountTies)
        .where(eq(accountTies.id, match.id)),
    );
    if (row === undefined) return undefined;
    return {
      id: match.id,
      otherAccountId: row.from === accountId ? row.to : row.from,
      otherName: match.otherName,
      status: match.status,
    };
  }

  /** Solo le accettate: la porta che una cartolina può davvero attraversare. */
  public async acceptedTieByName(
    accountId: string,
    name: string,
  ): Promise<{ id: string; otherAccountId: string } | undefined> {
    const tie = await this.tieByName(accountId, name);
    if (tie?.status !== "accettata") return undefined;
    return { id: tie.id, otherAccountId: tie.otherAccountId };
  }
}
