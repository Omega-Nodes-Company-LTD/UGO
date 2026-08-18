import { beings, householdTies, households, withHousehold, type DbClient } from "@ugo/db";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

/**
 * La parentela fra le case (ADR-092): proposta da una casa, vera solo quando
 * l'altra accetta, revocabile da ciascuna delle due in silenzio.
 *
 * Ogni scrittura passa da `withHousehold` con la casa che compie l'atto: le
 * politiche di riga (migrazione 0049) sono il muro, questo servizio è la
 * porta — e i due devono dire la stessa cosa.
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
  private async resolveHousehold(asked: string): Promise<string | undefined> {
    const trimmed = asked.trim();
    const byId = z.uuid().safeParse(trimmed).success ? eq(households.id, trimmed) : undefined;
    const [row] = await this.db
      .select({ id: households.id })
      .from(households)
      .where(
        and(isNull(households.closedAt), or(eq(households.slug, trimmed.toLowerCase()), byId)),
      );
    return row?.id;
  }

  public async propose(
    fromHouseholdId: string,
    input: { toHousehold: string; label: string; fromBeingId?: string | undefined },
  ): Promise<{ id: string } | TieRefusal> {
    const toHouseholdId = await this.resolveHousehold(input.toHousehold);
    if (toHouseholdId === undefined) return "casa-sconosciuta";
    if (toHouseholdId === fromHouseholdId) return "se-stessa";

    // il rifiuto parlato prima del vincolo: l'indice unico (0049) direbbe la
    // stessa cosa, ma con le parole di Postgres invece che con le nostre
    const [alive] = await this.db
      .select({ id: householdTies.id })
      .from(householdTies)
      .where(
        and(
          ne(householdTies.status, "revocata"),
          or(
            and(
              eq(householdTies.fromHouseholdId, fromHouseholdId),
              eq(householdTies.toHouseholdId, toHouseholdId),
            ),
            and(
              eq(householdTies.fromHouseholdId, toHouseholdId),
              eq(householdTies.toHouseholdId, fromHouseholdId),
            ),
          ),
        ),
      );
    if (alive !== undefined) return "gia-legate";

    const created = await withHousehold(this.db, fromHouseholdId, async (tx) => {
      const [row] = await tx
        .insert(householdTies)
        .values({
          fromHouseholdId,
          toHouseholdId,
          label: input.label.trim(),
          ...(input.fromBeingId !== undefined && { fromBeingId: input.fromBeingId }),
        })
        .returning({ id: householdTies.id });
      return row;
    });
    if (created === undefined) throw new Error("la parentela non è stata scritta");
    return { id: created.id };
  }

  public async accept(
    householdId: string,
    tieId: string,
    toBeingId?: string,
  ): Promise<{ id: string } | TieRefusal> {
    const [tie] = await this.db
      .select({
        to: householdTies.toHouseholdId,
        status: householdTies.status,
      })
      .from(householdTies)
      .where(eq(householdTies.id, tieId));
    if (tie === undefined) return "non-esiste";
    // accettare tocca SOLO al destinatario della proposta
    if (tie.to !== householdId) return "non-tua";
    if (tie.status !== "proposta") return "non-in-proposta";

    await withHousehold(this.db, householdId, (tx) =>
      tx
        .update(householdTies)
        .set({
          status: "accettata",
          acceptedAt: new Date(),
          ...(toBeingId !== undefined && { toBeingId }),
        })
        .where(eq(householdTies.id, tieId)),
    );
    return { id: tieId };
  }

  public async revoke(householdId: string, tieId: string): Promise<{ id: string } | TieRefusal> {
    const [tie] = await this.db
      .select({
        from: householdTies.fromHouseholdId,
        to: householdTies.toHouseholdId,
        status: householdTies.status,
      })
      .from(householdTies)
      .where(eq(householdTies.id, tieId));
    if (tie === undefined) return "non-esiste";
    if (tie.from !== householdId && tie.to !== householdId) return "non-tua";
    if (tie.status === "revocata") return "gia-revocata";

    await withHousehold(this.db, householdId, (tx) =>
      tx
        .update(householdTies)
        .set({ status: "revocata", revokedAt: new Date() })
        .where(eq(householdTies.id, tieId)),
    );
    return { id: tieId };
  }

  /** Le parentele di una casa, con l'altra parte detta per nome e non per id. */
  public async listFor(householdId: string): Promise<TieView[]> {
    const rows = await this.db
      .select()
      .from(householdTies)
      .where(
        or(
          eq(householdTies.fromHouseholdId, householdId),
          eq(householdTies.toHouseholdId, householdId),
        ),
      )
      .orderBy(householdTies.proposedAt);
    if (rows.length === 0) return [];

    const otherIds = rows.map((row) =>
      row.fromHouseholdId === householdId ? row.toHouseholdId : row.fromHouseholdId,
    );
    const names = await this.db
      .select({ id: households.id, slug: households.slug, name: households.name })
      .from(households)
      .where(inArray(households.id, otherIds));
    const byId = new Map(names.map((house) => [house.id, house]));

    return rows.map((row) => {
      const proposedByUs = row.fromHouseholdId === householdId;
      const other = byId.get(proposedByUs ? row.toHouseholdId : row.fromHouseholdId);
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
    householdId: string,
    name: string,
  ): Promise<
    { id: string; otherHouseholdId: string; otherName: string; status: string } | undefined
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
    const ties = await this.listFor(householdId);
    const match = ties.find(
      (tie) =>
        tie.status !== "revocata" &&
        (plain(tie.otherSlug) === wanted ||
          plain(tie.otherName) === wanted ||
          plain(tie.label) === wanted),
    );
    if (match === undefined) return undefined;
    const [row] = await this.db
      .select({
        from: householdTies.fromHouseholdId,
        to: householdTies.toHouseholdId,
      })
      .from(householdTies)
      .where(eq(householdTies.id, match.id));
    if (row === undefined) return undefined;
    return {
      id: match.id,
      otherHouseholdId: row.from === householdId ? row.to : row.from,
      otherName: match.otherName,
      status: match.status,
    };
  }

  /** Solo le accettate: la porta che una cartolina può davvero attraversare. */
  public async acceptedTieByName(
    householdId: string,
    name: string,
  ): Promise<{ id: string; otherHouseholdId: string } | undefined> {
    const tie = await this.tieByName(householdId, name);
    if (tie?.status !== "accettata") return undefined;
    return { id: tie.id, otherHouseholdId: tie.otherHouseholdId };
  }

  /** Il nome con cui parlare di un essere locale, per il pannello. */
  public async beingNameOf(householdId: string, beingId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ name: beings.displayName })
      .from(beings)
      .where(and(eq(beings.id, beingId), eq(beings.householdId, householdId)));
    return row?.name;
  }
}
