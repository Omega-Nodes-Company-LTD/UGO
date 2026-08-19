import {
  desires,
  gosini,
  accountTies,
  accounts,
  memories,
  parcels,
  withAccount,
  withPost,
  type DbClient,
} from "@ugo/db";
import { decryptText, encryptText, unwrapDataKey } from "@ugo/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

/**
 * La cartolina (ADR-099): un messaggio o un ricordo, testo, da una casa
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
  private async houseKeyFor(accountId: string): Promise<Buffer> {
    // ADR-099 §4: la chiave è di CHI RICEVE, quindi quasi sempre di un'altra
    // casa — `withPost` è l'unica ragione per cui questa riga trova qualcosa.
    // Ed è la chiave AVVOLTA: senza la KEK di processo non apre niente.
    const [row] = await withPost(this.db, (tx) =>
      tx
        .select({ wrapped: accounts.wrappedDataKey })
        .from(accounts)
        .where(eq(accounts.id, accountId)),
    );
    if (row?.wrapped == null) return this.masterKey;
    try {
      return unwrapDataKey(row.wrapped, this.masterKey);
    } catch {
      return this.masterKey;
    }
  }

  private async eldestOf(tx: DbClient, accountId: string): Promise<string | undefined> {
    const [eldest] = await tx
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.accountId, accountId), isNull(gosini.retiredAt)))
      .orderBy(asc(gosini.bornAt))
      .limit(1);
    return eldest?.id;
  }

  public async send(
    fromAccountId: string,
    input: {
      tieId: string;
      fromGosinoId: string;
      toGosinoId?: string | undefined;
      kind: string;
      text: string;
    },
  ): Promise<{ id: string } | ParcelRefusal> {
    const [tie] = await withPost(this.db, (tx) =>
      tx
        .select({
          from: accountTies.fromAccountId,
          to: accountTies.toAccountId,
          status: accountTies.status,
          label: accountTies.label,
        })
        .from(accountTies)
        .where(eq(accountTies.id, input.tieId)),
    );
    if (tie === undefined) return "parentela-sconosciuta";
    if (tie.from !== fromAccountId && tie.to !== fromAccountId) return "parentela-sconosciuta";
    // la porta si apre solo su un consenso dato, mai su una proposta pendente
    if (tie.status !== "accettata") return "non-accettata";
    const toAccountId = tie.from === fromAccountId ? tie.to : tie.from;

    const [sender] = await withPost(this.db, (tx) =>
      tx
        .select({ id: gosini.id })
        .from(gosini)
        .where(and(eq(gosini.id, input.fromGosinoId), eq(gosini.accountId, fromAccountId))),
    );
    if (sender === undefined) return "esemplare-sconosciuto";
    const named = input.toGosinoId;
    if (named !== undefined) {
      // l'esemplare a cui è indirizzata vive nell'altra casa: senza la porta
      // ogni destinatario nominato risulterebbe inesistente
      const [recipient] = await withPost(this.db, (tx) =>
        tx
          .select({ id: gosini.id })
          .from(gosini)
          .where(and(eq(gosini.id, named), eq(gosini.accountId, toAccountId))),
      );
      if (recipient === undefined) return "destinatario-sconosciuto";
    }

    const cipher = encryptText(input.text.trim(), await this.houseKeyFor(toAccountId));
    const sent = await withAccount(this.db, fromAccountId, async (tx) => {
      const [row] = await tx
        .insert(parcels)
        .values({
          tieId: input.tieId,
          fromAccountId,
          toAccountId,
          fromGosinoId: input.fromGosinoId,
          ...(input.toGosinoId !== undefined && { toGosinoId: input.toGosinoId }),
          kind: input.kind,
          text: cipher,
        })
        .returning({ id: parcels.id });
      return row;
    });
    if (sent === undefined) throw new Error("la cartolina non è stata scritta");

    await this.deliver(sent.id, toAccountId, input.toGosinoId, fromAccountId);
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
    toAccountId: string,
    toGosinoId: string | undefined,
    fromAccountId: string,
  ): Promise<void> {
    const [sender] = await withPost(this.db, (tx) =>
      tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, fromAccountId)),
    );
    await withAccount(this.db, toAccountId, async (tx) => {
      const recipient = toGosinoId ?? (await this.eldestOf(tx, toAccountId));
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
  public async inbox(accountId: string): Promise<ParcelView[]> {
    const key = await this.houseKeyFor(accountId);
    const rows = await withPost(this.db, (tx) =>
      tx
        .select({
        id: parcels.id,
        kind: parcels.kind,
        text: parcels.text,
        status: parcels.status,
        createdAt: parcels.createdAt,
        keptAt: parcels.keptAt,
        otherSlug: accounts.slug,
        otherName: accounts.name,
      })
        .from(parcels)
        .innerJoin(accounts, eq(accounts.id, parcels.fromAccountId))
        .where(eq(parcels.toAccountId, accountId))
        .orderBy(desc(parcels.createdAt)),
    );
    return rows.map((row) => ({
      ...row,
      text: this.open(row.text, key),
    }));
  }

  /** Le spedite: metadati e basta — il testo non è più in mano al mittente. */
  public async outbox(accountId: string): Promise<ParcelView[]> {
    const rows = await withPost(this.db, (tx) =>
      tx
        .select({
        id: parcels.id,
        kind: parcels.kind,
        status: parcels.status,
        createdAt: parcels.createdAt,
        keptAt: parcels.keptAt,
        otherSlug: accounts.slug,
        otherName: accounts.name,
      })
        .from(parcels)
        .innerJoin(accounts, eq(accounts.id, parcels.toAccountId))
        .where(eq(parcels.fromAccountId, accountId))
        .orderBy(desc(parcels.createdAt)),
    );
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
   * «Tenere» un ricordo ricevuto (ADR-099 §3): diventa una riga `memories`
   * del gosino destinatario, IN CHIARO (ADR-091), con l'origine dichiarata
   * nel testo — un ricordo arrivato da fuori casa non deve sembrare nato in
   * casa. Senza embedder: lo ripesca il braccio lessicale (ADR-022), come il
   * sapere della dote.
   */
  public async keep(
    accountId: string,
    parcelId: string,
  ): Promise<{ memoryId: string } | ParcelRefusal> {
    const [parcel] = await withPost(this.db, (tx) =>
      tx.select({
        to: parcels.toAccountId,
        toGosinoId: parcels.toGosinoId,
        kind: parcels.kind,
        text: parcels.text,
        keptAt: parcels.keptAt,
        from: parcels.fromAccountId,
      })
        .from(parcels)
        .where(eq(parcels.id, parcelId)),
    );
    if (parcel === undefined) return "non-esiste";
    if (parcel.to !== accountId) return "non-tua";
    if (parcel.kind !== "ricordo") return "non-un-ricordo";
    if (parcel.keptAt !== null) return "gia-tenuta";

    const opened = this.open(parcel.text, await this.houseKeyFor(accountId));
    if (opened === "") return "illeggibile";
    const [sender] = await withPost(this.db, (tx) =>
      tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, parcel.from)),
    );

    const kept = await withAccount(this.db, accountId, async (tx) => {
      const gosinoId = parcel.toGosinoId ?? (await this.eldestOf(tx, accountId));
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
