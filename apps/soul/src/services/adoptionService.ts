import { adoptions, gosini, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";

/**
 * L'adozione (ADR-084): il filo fra la vetrina e la consegna.
 *
 * Quattro stati, e ognuno è un fatto del mondo e non una casella: **prenotata**
 * (qualcuno l'ha scelto, e da quel momento nessun altro lo vede in vetrina),
 * **pagata** (l'allevamento ha visto i soldi), **consegnata** (ha cambiato
 * casa, e la catena lo sa), **annullata** (non se n'è fatto niente, e il
 * cucciolo torna in vetrina).
 *
 * L'ordine non si salta: non si consegna quello che non è stato pagato. Non
 * per burocrazia — perché la consegna è irreversibile e il pagamento no.
 */

/** Quanto vale una promessa senza soldi. Poi il cucciolo torna di tutti. */
export const RESERVATION_DAYS = 7;

export interface AdoptionRow {
  id: string;
  gosinoId: string;
  gosinoName: string;
  status: string;
  priceCents: number | null;
  currency: string;
  paymentRef: string | null;
  chainSeq: number | null;
  reservedAt: Date;
  deliveredAt: Date | null;
}

export class AdoptionService {
  public constructor(private readonly db: DbClient) {}

  /**
   * Prenota: toglie il cucciolo dalla vetrina e apre la pratica.
   *
   * Toglierlo subito è la parte che conta. Una vetrina che continua a mostrare
   * un cucciolo già scelto produce due famiglie che credono di averlo — e una
   * delle due lo scopre dopo aver pagato.
   */
  public async reserve(
    gosinoId: string,
    buyerAccountId: string,
  ): Promise<{ id: string; priceCents: number | null } | undefined> {
    return this.db.transaction(async (tx) => {
      const [cub] = await tx
        .select({
          house: gosini.accountId,
          price: gosini.priceCents,
          listed: gosini.listedAt,
          origin: gosini.origin,
          gone: gosini.retiredAt,
        })
        .from(gosini)
        .where(eq(gosini.id, gosinoId));
      // non in vetrina, non nato, o già andato: non c'è niente da prenotare
      if (cub?.listed == null || cub.origin !== "nato" || cub.gone !== null) {
        return undefined;
      }

      await tx.update(gosini).set({ listedAt: null }).where(eq(gosini.id, gosinoId));
      const [row] = await tx
        .insert(adoptions)
        .values({
          gosinoId,
          kennelAccountId: cub.house,
          buyerAccountId,
          status: "prenotata",
          ...(cub.price !== null && { priceCents: cub.price }),
        })
        .returning({ id: adoptions.id });
      return row === undefined ? undefined : { id: row.id, priceCents: cub.price };
    });
  }

  /** Le pratiche di una casa: quelle che cede e quelle che riceve. */
  public async of(accountId: string): Promise<AdoptionRow[]> {
    const rows = await this.db
      .select({
        id: adoptions.id,
        gosinoId: adoptions.gosinoId,
        gosinoName: gosini.name,
        status: adoptions.status,
        priceCents: adoptions.priceCents,
        currency: adoptions.currency,
        paymentRef: adoptions.paymentRef,
        chainSeq: adoptions.chainSeq,
        reservedAt: adoptions.reservedAt,
        deliveredAt: adoptions.deliveredAt,
      })
      .from(adoptions)
      .innerJoin(gosini, eq(adoptions.gosinoId, gosini.id))
      .where(
        or(
          eq(adoptions.kennelAccountId, accountId),
          eq(adoptions.buyerAccountId, accountId),
        ),
      )
      .orderBy(desc(adoptions.reservedAt));
    return rows;
  }

  /** La pratica, vista da chi cede: le altre non sono affari suoi. */
  public async ofKennel(
    kennelAccountId: string,
    id: string,
  ): Promise<
    | {
        id: string;
        gosinoId: string;
        buyerAccountId: string;
        status: string;
      }
    | undefined
  > {
    const [row] = await this.db
      .select({
        id: adoptions.id,
        gosinoId: adoptions.gosinoId,
        buyerAccountId: adoptions.buyerAccountId,
        status: adoptions.status,
      })
      .from(adoptions)
      .where(and(eq(adoptions.id, id), eq(adoptions.kennelAccountId, kennelAccountId)));
    return row;
  }

  /** L'allevamento ha visto i soldi. Da qui si può consegnare. */
  public async markPaid(id: string, paymentRef: string, at = new Date()): Promise<boolean> {
    const done = await this.db
      .update(adoptions)
      .set({ status: "pagata", paidAt: at, paymentRef })
      .where(and(eq(adoptions.id, id), eq(adoptions.status, "prenotata")))
      .returning({ id: adoptions.id });
    return done.length > 0;
  }

  /** Consegnata: la creatura ha cambiato casa, e la catena lo sa (o non lo sa). */
  public async markDelivered(id: string, chainSeq: number | undefined, at = new Date()): Promise<void> {
    await this.db
      .update(adoptions)
      .set({
        status: "consegnata",
        deliveredAt: at,
        ...(chainSeq !== undefined && { chainSeq }),
      })
      .where(eq(adoptions.id, id));
  }

  /**
   * Annulla, e **rimette il cucciolo in vetrina**: una pratica chiusa che
   * lasciasse la creatura invisibile sarebbe un cucciolo sparito per una
   * trattativa andata male.
   */
  public async cancel(id: string, at = new Date()): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const done = await tx
        .update(adoptions)
        .set({ status: "annullata", cancelledAt: at })
        .where(and(eq(adoptions.id, id), inArray(adoptions.status, ["prenotata", "pagata"])))
        .returning({ gosinoId: adoptions.gosinoId });
      const row = done[0];
      if (row === undefined) return false;
      await tx.update(gosini).set({ listedAt: at }).where(eq(gosini.id, row.gosinoId));
      return true;
    });
  }

  /**
   * Le prenotazioni scadute tornano in vetrina.
   *
   * Girano **quando qualcuno guarda**, non su un orologio: una prenotazione
   * scaduta non fa danno finché nessuno cerca un cucciolo, e un battito in più
   * per una cosa che si può fare pigramente è un battito che qualcuno dovrà
   * spegnere.
   */
  public async releaseExpired(at = new Date()): Promise<number> {
    const deadline = new Date(at.getTime() - RESERVATION_DAYS * 86_400_000);
    return this.db.transaction(async (tx) => {
      const stale = await tx
        .update(adoptions)
        .set({ status: "annullata", cancelledAt: at })
        .where(
          and(
            eq(adoptions.status, "prenotata"),
            lt(adoptions.reservedAt, deadline),
            isNull(adoptions.deliveredAt),
          ),
        )
        .returning({ gosinoId: adoptions.gosinoId });
      for (const row of stale) {
        await tx.update(gosini).set({ listedAt: at }).where(eq(gosini.id, row.gosinoId));
      }
      return stale.length;
    });
  }
}
