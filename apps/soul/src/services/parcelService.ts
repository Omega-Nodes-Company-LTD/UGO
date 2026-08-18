import {
  desires,
  gosini,
  householdTies,
  households,
  memories,
  parcels,
  withHousehold,
  type DbClient,
} from "@ugo/db";
import { decryptText, encryptText, unwrapDataKey } from "@ugo/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

/**
 * La cartolina (ADR-092): un messaggio o un ricordo, testo, da una casa
 * all'altra — e SOLO su azione esplicita di una persona.
 *
 * **`send()` è l'unico punto d'invio del sistema.** Le rotte del pannello e il
 * gesto in chat arrivano qui; l'iniziativa, il sogno, la ruminazione e i job
 * non devono arrivarci mai, e `parcelGate.test.ts` legge i sorgenti per
 * tenerlo vero — la famiglia di guardie di ADR-091.
 *
 * Il testo a riposo è cifrato con la DEK della casa DESTINATARIA (con
 * ricaduta sulla chiave di processo per le case senza DEK, come ADR-075): una
 * cartolina è di chi la riceve, e il mittente, spedita che l'ha, non ha più
 * un canale di lettura.
 */

export type ParcelRefusal =
  | "parentela-sconosciuta"
  | "non-accettata"
  | "esemplare-sconosciuto"
  | "destinatario-sconosciuto"
  | "non-esiste"
  | "non-tua"
  | "non-un-ricordo"
  | "gia-tenuta"
  | "illeggibile";

export interface ParcelView {
  id: string;
  kind: string;
  /** in chiaro per chi la riceve; mai presente nell'elenco del mittente */
  text?: string;
  otherSlug: string;
  otherName: string;
  status: string;
  createdAt: Date;
  keptAt: Date | null;
}

export class ParcelService {
  public constructor(
    private readonly db: DbClient,
    private readonly masterKey: Buffer,
  ) {}

  /** La chiave con cui una casa custodisce ciò che è suo (ADR-019/075). */
  private async houseKeyFor(householdId: string): Promise<Buffer> {
    const [row] = await this.db
      .select({ wrapped: households.wrappedDataKey })
      .from(households)
      .where(eq(households.id, householdId));
    if (row?.wrapped == null) return this.masterKey;
    try {
      return unwrapDataKey(row.wrapped, this.masterKey);
    } catch {
      return this.masterKey;
    }
  }

  private async eldestOf(tx: DbClient, householdId: string): Promise<string | undefined> {
    const [eldest] = await tx
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.householdId, householdId), isNull(gosini.retiredAt)))
      .orderBy(asc(gosini.bornAt))
      .limit(1);
    return eldest?.id;
  }

  public async send(
    fromHouseholdId: string,
    input: {
      tieId: string;
      fromGosinoId: string;
      toGosinoId?: string | undefined;
      kind: string;
      text: string;
    },
  ): Promise<{ id: string } | ParcelRefusal> {
    const [tie] = await this.db
      .select({
        from: householdTies.fromHouseholdId,
        to: householdTies.toHouseholdId,
        status: householdTies.status,
        label: householdTies.label,
      })
      .from(householdTies)
      .where(eq(householdTies.id, input.tieId));
    if (tie === undefined) return "parentela-sconosciuta";
    if (tie.from !== fromHouseholdId && tie.to !== fromHouseholdId) return "parentela-sconosciuta";
    // la porta si apre solo su un consenso dato, mai su una proposta pendente
    if (tie.status !== "accettata") return "non-accettata";
    const toHouseholdId = tie.from === fromHouseholdId ? tie.to : tie.from;

    const [sender] = await this.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.id, input.fromGosinoId), eq(gosini.householdId, fromHouseholdId)));
    if (sender === undefined) return "esemplare-sconosciuto";
    if (input.toGosinoId !== undefined) {
      const [recipient] = await this.db
        .select({ id: gosini.id })
        .from(gosini)
        .where(and(eq(gosini.id, input.toGosinoId), eq(gosini.householdId, toHouseholdId)));
      if (recipient === undefined) return "destinatario-sconosciuto";
    }

    const cipher = encryptText(input.text.trim(), await this.houseKeyFor(toHouseholdId));
    const sent = await withHousehold(this.db, fromHouseholdId, async (tx) => {
      const [row] = await tx
        .insert(parcels)
        .values({
          tieId: input.tieId,
          fromHouseholdId,
          toHouseholdId,
          fromGosinoId: input.fromGosinoId,
          ...(input.toGosinoId !== undefined && { toGosinoId: input.toGosinoId }),
          kind: input.kind,
          text: cipher,
        })
        .returning({ id: parcels.id });
      return row;
    });
    if (sent === undefined) throw new Error("la cartolina non è stata scritta");

    await this.deliver(sent.id, toHouseholdId, input.toGosinoId, fromHouseholdId);
    return { id: sent.id };
  }

  /**
   * La consegna: un desiderio del gosino destinatario, che lo dirà quando gli
   * pare dal suo canale di sempre (ADR-078) — mai la voce di un'altra casa
   * dentro casa tua nel momento deciso da loro. Gira nello scope del
   * DESTINATARIO: la policy di UPDATE su `parcels` (0049) è sua.
   */
  private async deliver(
    parcelId: string,
    toHouseholdId: string,
    toGosinoId: string | undefined,
    fromHouseholdId: string,
  ): Promise<void> {
    const [sender] = await this.db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, fromHouseholdId));
    await withHousehold(this.db, toHouseholdId, async (tx) => {
      const recipient = toGosinoId ?? (await this.eldestOf(tx, toHouseholdId));
      if (recipient === undefined) return;
      await tx.insert(desires).values({
        gosinoId: recipient,
        text: `è arrivata una cartolina per me da «${sender?.name ?? "una casa amica"}»: aprite la cassetta della posta nel pannello`,
      });
      await tx
        .update(parcels)
        .set({ status: "consegnata", deliveredAt: new Date() })
        .where(eq(parcels.id, parcelId));
    });
  }

  /** La cassetta della posta: in chiaro, perché è di chi la riceve. */
  public async inbox(householdId: string): Promise<ParcelView[]> {
    const key = await this.houseKeyFor(householdId);
    const rows = await this.db
      .select({
        id: parcels.id,
        kind: parcels.kind,
        text: parcels.text,
        status: parcels.status,
        createdAt: parcels.createdAt,
        keptAt: parcels.keptAt,
        otherSlug: households.slug,
        otherName: households.name,
      })
      .from(parcels)
      .innerJoin(households, eq(households.id, parcels.fromHouseholdId))
      .where(eq(parcels.toHouseholdId, householdId))
      .orderBy(desc(parcels.createdAt));
    return rows.map((row) => ({
      ...row,
      text: this.open(row.text, key),
    }));
  }

  /** Le spedite: metadati e basta — il testo non è più in mano al mittente. */
  public async outbox(householdId: string): Promise<ParcelView[]> {
    const rows = await this.db
      .select({
        id: parcels.id,
        kind: parcels.kind,
        status: parcels.status,
        createdAt: parcels.createdAt,
        keptAt: parcels.keptAt,
        otherSlug: households.slug,
        otherName: households.name,
      })
      .from(parcels)
      .innerJoin(households, eq(households.id, parcels.toHouseholdId))
      .where(eq(parcels.fromHouseholdId, householdId))
      .orderBy(desc(parcels.createdAt));
    return rows;
  }

  private open(cipher: string, key: Buffer): string {
    try {
      return decryptText(cipher, key);
    } catch {
      // non si finge: una cartolina che non si apre è un'informazione
      return "";
    }
  }

  /**
   * «Tenere» un ricordo ricevuto (ADR-092 §3): diventa una riga `memories`
   * del gosino destinatario, IN CHIARO (ADR-091), con l'origine dichiarata
   * nel testo — un ricordo arrivato da fuori casa non deve sembrare nato in
   * casa. Senza embedder: lo ripesca il braccio lessicale (ADR-022), come il
   * sapere della dote.
   */
  public async keep(
    householdId: string,
    parcelId: string,
  ): Promise<{ memoryId: string } | ParcelRefusal> {
    const [parcel] = await this.db
      .select({
        to: parcels.toHouseholdId,
        toGosinoId: parcels.toGosinoId,
        kind: parcels.kind,
        text: parcels.text,
        keptAt: parcels.keptAt,
        from: parcels.fromHouseholdId,
      })
      .from(parcels)
      .where(eq(parcels.id, parcelId));
    if (parcel === undefined) return "non-esiste";
    if (parcel.to !== householdId) return "non-tua";
    if (parcel.kind !== "ricordo") return "non-un-ricordo";
    if (parcel.keptAt !== null) return "gia-tenuta";

    const opened = this.open(parcel.text, await this.houseKeyFor(householdId));
    if (opened === "") return "illeggibile";
    const [sender] = await this.db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, parcel.from));

    const kept = await withHousehold(this.db, householdId, async (tx) => {
      const gosinoId = parcel.toGosinoId ?? (await this.eldestOf(tx, householdId));
      if (gosinoId === undefined) return undefined;
      const [memory] = await tx
        .insert(memories)
        .values({
          gosinoId,
          kind: "episode",
          text: `Cartolina da «${sender?.name ?? "una casa amica"}»: ${opened}`,
          sourceRefs: { parcelId },
        })
        .returning({ id: memories.id });
      if (memory === undefined) return undefined;
      await tx.update(parcels).set({ keptAt: new Date() }).where(eq(parcels.id, parcelId));
      return memory.id;
    });
    if (kept === undefined) return "non-esiste";
    return { memoryId: kept };
  }
}
