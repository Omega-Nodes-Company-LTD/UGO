import { placedProps, propStock, rooms, slugOfRoom, type DbClient } from "@ugo/db";
import {
  MAX_PROPS_PER_ROOM,
  PROP_KINDS,
  type PlacedProp,
  type PropKind,
  type SceneProp,
} from "@ugo/shared";
import { and, asc, eq, sql } from "drizzle-orm";

/**
 * Cosa c'è nella stanza, e quante ne restano (ADR-051).
 *
 * Tutto ciò che riguarda gli arredi passa da qui, e la ragione è una sola:
 * **posare un oggetto e scalare la scorta sono un atto solo**. Fatti in due
 * punti diversi, un errore fra i due lascia una casa con un cuscino in più e
 * una scorta intatta, o viceversa — e nessuno dei due è un errore che qualcuno
 * segnala, perché nessuno dei due si vede.
 */

export class PropLimitError extends Error {}
export class PropStockError extends Error {}
export class RoomUnknownError extends Error {}

export interface PropStockView {
  kind: PropKind;
  /** `null` = questa casa non ha un limite (vedi `prop_stock` nello schema) */
  remaining: number | null;
  refillPerWeek: number;
}

export class PropService {
  public constructor(private readonly db: DbClient) {}

  /** Gli arredi di una stanza, come il muso li vuole. */
  public async inRoom(householdId: string, roomSlug: string): Promise<SceneProp[]> {
    const rows = await this.db
      .select({
        id: placedProps.id,
        kind: placedProps.kind,
        x: placedProps.x,
        z: placedProps.z,
        rot: placedProps.rot,
      })
      .from(placedProps)
      .where(
        and(
          eq(placedProps.householdId, householdId),
          eq(placedProps.roomSlug, slugOfRoom(roomSlug)),
        ),
      )
      .orderBy(asc(placedProps.createdAt));
    // il `check` del database garantisce già l'insieme, quindi il cast qui non
    // sta indovinando: sta dicendo al compilatore ciò che Postgres impone
    return rows.map((row) => ({ ...row, kind: row.kind as PropKind }));
  }

  /**
   * Posa un arredo. Un atto solo: verifica stanza, tetto e scorta, scrive.
   *
   * La transazione non è cerimonia — fra il conteggio e l'inserimento c'è
   * esattamente la finestra in cui due schede aperte sul pannello posano il
   * nono cuscino ciascuna.
   */
  public async place(
    householdId: string,
    roomSlug: string,
    prop: PlacedProp,
  ): Promise<SceneProp> {
    const slug = slugOfRoom(roomSlug);
    return this.db.transaction(async (tx) => {
      const [room] = await tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.householdId, householdId), eq(rooms.slug, slug)));
      // ADR-039: niente etichette inventate. Creare la stanza qui in silenzio
      // farebbe crescere il catalogo per refuso, che è precisamente ciò che
      // quella decisione ha chiuso.
      if (room === undefined) throw new RoomUnknownError(slug);

      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(placedProps)
        .where(and(eq(placedProps.householdId, householdId), eq(placedProps.roomSlug, slug)));
      if ((count?.n ?? 0) >= MAX_PROPS_PER_ROOM) throw new PropLimitError(slug);

      // la scorta si scala **prima** dell'inserimento, e con un `where` che
      // include `remaining > 0`: così è il database a dire di no quando due
      // richieste si contendono l'ultima mela, invece di due letture che
      // vedono entrambe «ne resta una»
      const spent = await tx
        .update(propStock)
        .set({ remaining: sql`${propStock.remaining} - 1` })
        .where(
          and(
            eq(propStock.householdId, householdId),
            eq(propStock.kind, prop.kind),
            sql`${propStock.remaining} > 0`,
          ),
        )
        .returning({ id: propStock.id });
      if (spent.length === 0) {
        // nessuna riga toccata: o la casa non ha limiti (nessuna riga), o è a
        // secco (riga a zero). Sono due esiti opposti e vanno distinti.
        const [limit] = await tx
          .select({ remaining: propStock.remaining })
          .from(propStock)
          .where(and(eq(propStock.householdId, householdId), eq(propStock.kind, prop.kind)));
        if (limit !== undefined) throw new PropStockError(prop.kind);
      }

      const [made] = await tx
        .insert(placedProps)
        .values({ householdId, roomSlug: slug, ...prop })
        .returning({
          id: placedProps.id,
          kind: placedProps.kind,
          x: placedProps.x,
          z: placedProps.z,
          rot: placedProps.rot,
        });
      if (made === undefined) throw new Error("insert returned nothing");
      return { ...made, kind: made.kind as PropKind };
    });
  }

  /** Sposta un arredo già posato. Non tocca le scorte: è lo stesso oggetto. */
  public async move(
    householdId: string,
    id: string,
    at: { x: number; z: number; rot: number },
  ): Promise<SceneProp | undefined> {
    const [moved] = await this.db
      .update(placedProps)
      .set(at)
      .where(and(eq(placedProps.householdId, householdId), eq(placedProps.id, id)))
      .returning({
        id: placedProps.id,
        kind: placedProps.kind,
        roomSlug: placedProps.roomSlug,
        x: placedProps.x,
        z: placedProps.z,
        rot: placedProps.rot,
      });
    return moved === undefined ? undefined : { ...moved, kind: moved.kind as PropKind };
  }

  /**
   * Toglie un arredo, e **restituisce la scorta**.
   *
   * Senza la restituzione, un cliente con due mele a settimana le perderebbe
   * riposizionando un cuscino — cioè il pannello punirebbe il ripensamento, che
   * è il modo in cui uno strumento diventa qualcosa che si ha paura di toccare.
   */
  public async remove(householdId: string, id: string): Promise<{ kind: PropKind } | undefined> {
    return this.db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(placedProps)
        .where(and(eq(placedProps.householdId, householdId), eq(placedProps.id, id)))
        .returning({ kind: placedProps.kind, roomSlug: placedProps.roomSlug });
      if (gone === undefined) return undefined;
      await tx
        .update(propStock)
        .set({ remaining: sql`${propStock.remaining} + 1` })
        .where(and(eq(propStock.householdId, householdId), eq(propStock.kind, gone.kind)));
      return { kind: gone.kind as PropKind };
    });
  }

  /**
   * Cosa può ancora posare questa casa.
   *
   * Un tipo senza riga risponde `remaining: null`, che è **senza limiti** e non
   * zero. La casa del proprietario non ha righe e non ne vuole; quella di un
   * cliente ne ha una per tipo, con il rifornimento settimanale.
   */
  public async stock(householdId: string): Promise<PropStockView[]> {
    const rows = await this.db
      .select({
        kind: propStock.kind,
        remaining: propStock.remaining,
        refillPerWeek: propStock.refillPerWeek,
      })
      .from(propStock)
      .where(eq(propStock.householdId, householdId));
    const byKind = new Map(rows.map((row) => [row.kind, row]));
    return PROP_KINDS.map((kind) => {
      const row = byKind.get(kind);
      return {
        kind,
        remaining: row?.remaining ?? null,
        refillPerWeek: row?.refillPerWeek ?? 0,
      };
    });
  }

  /** Mette (o toglie) un limite a un tipo. `null` = questa casa non ne ha. */
  public async setStock(
    householdId: string,
    kind: PropKind,
    remaining: number | null,
    refillPerWeek = 0,
  ): Promise<void> {
    if (remaining === null) {
      await this.db
        .delete(propStock)
        .where(and(eq(propStock.householdId, householdId), eq(propStock.kind, kind)));
      return;
    }
    await this.db
      .insert(propStock)
      .values({ householdId, kind, remaining, refillPerWeek })
      .onConflictDoUpdate({
        target: [propStock.householdId, propStock.kind],
        set: { remaining, refillPerWeek },
      });
  }
}
