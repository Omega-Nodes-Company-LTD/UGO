import { accounts, traitSets, withMarket, type DbClient } from "@ugo/db";
import { genomeHash, holderHash } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { AdoptionService } from "./adoptionService.js";
import type { RegistryClient } from "./registryClient.js";
import { TransferService } from "./transferService.js";

/**
 * La consegna di un'adozione (ADR-082, ADR-084): qui la creatura cambia casa
 * davvero e l'atto va in catena. Estratta dalla rotta perché le porte sono
 * due: il clic dell'allevamento, e la consegna automatica della fonderia
 * quando il pagamento arriva (ADR-128 §4). Due strade per consegnare che
 * scrivessero righe diverse sarebbero due modi di cambiare casa.
 */

export interface DeliveryDeps {
  db: DbClient;
  chain?: RegistryClient | undefined;
  registry?: { reload: () => Promise<void> } | undefined;
  log?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export type Delivery =
  | { ok: true; chainSeq: number | null; transfer: Record<string, unknown> }
  /** `missing`, `unpaid`, o il rifiuto del trasferimento in parole */
  | { ok: false; reason: string };

export async function deliverAdoption(deps: DeliveryDeps, kennelAccountId: string, adoptionId: string): Promise<Delivery> {
  const moved = await withMarket(deps.db, async (db) => {
    const adoptions = new AdoptionService(db);
    const pratica = await adoptions.ofKennel(kennelAccountId, adoptionId);
    if (pratica === undefined) return "missing" as const;
    // non si consegna quello che non è stato pagato: la consegna è
    // irreversibile, il pagamento no
    if (pratica.status !== "pagata") return "unpaid" as const;
    // l'impronta si legge PRIMA: dopo, quel genoma è di un'altra casa
    const [genome] = await db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, pratica.gosinoId))
      .orderBy(traitSets.version)
      .limit(1);
    const done = await new TransferService(db).cede(kennelAccountId, pratica.gosinoId, pratica.buyerAccountId);
    if (typeof done === "string") return { refused: done };
    return { pratica, genome, done };
  });
  if (typeof moved === "string") return { ok: false, reason: moved };
  if ("refused" in moved) return { ok: false, reason: moved.refused };
  const { pratica, genome, done } = moved;

  /**
   * L'atto in catena. Se il registro è giù **la consegna è avvenuta lo
   * stesso** — le righe sono già cambiate casa — e la pratica resta con
   * `chainSeq` vuoto: una cosa da guardare, non un dettaglio.
   */
  let chainSeq: number | undefined;
  if (deps.chain !== undefined) {
    const outcome = await deps.chain.publish({
      kind: "transfer",
      gosinoId: pratica.gosinoId,
      genomeHash: genomeHash(genome?.traits ?? {}),
      at: new Date().toISOString(),
      fromHash: holderHash(kennelAccountId),
      toHash: holderHash(pratica.buyerAccountId),
    });
    if (outcome.published) chainSeq = outcome.seq;
    else deps.log?.warn({ adozione: adoptionId, reason: outcome.reason }, "transfer not published");
  }
  await withMarket(deps.db, (db) => new AdoptionService(db).markDelivered(adoptionId, chainSeq));
  await deps.registry?.reload();
  return { ok: true, chainSeq: chainSeq ?? null, transfer: { ...done } };
}

/**
 * Pagata: e se chi vende consegna da sé (la fonderia, ADR-128), consegnata.
 * È la «stessa porta» di ADR-084 §3 per ogni incasso — a mano, Stripe,
 * PayPal o gratuito.
 */
export async function settleAdoption(
  deps: DeliveryDeps,
  adoptionId: string,
  payment: { ref: string; provider: "stripe" | "paypal" | "gratuita" | null },
): Promise<"paid" | "delivered" | "not-reserved" | "missing"> {
  const paid = await withMarket(deps.db, async (db) => {
    const adoptions = new AdoptionService(db);
    const kennel = await adoptions.kennelOf(adoptionId);
    if (kennel === undefined) return "missing" as const;
    if (!(await adoptions.markPaid(adoptionId, payment.ref, new Date(), payment.provider))) {
      return "not-reserved" as const;
    }
    const [seller] = await db
      .select({ autoDeliver: accounts.autoDeliver })
      .from(accounts)
      .where(eq(accounts.id, kennel));
    return { kennel, autoDeliver: seller?.autoDeliver === true };
  });
  if (typeof paid === "string") return paid;
  if (!paid.autoDeliver) return "paid";
  const delivered = await deliverAdoption(deps, paid.kennel, adoptionId);
  return delivered.ok ? "delivered" : "paid";
}
