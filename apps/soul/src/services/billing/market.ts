import { accounts, breederPayoutAccounts, withAccount, withMarket, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import { refundAdoption, type ConnectState } from "./connect.js";
import type { PayPalClient } from "./paypal.js";
import type { StripeClient } from "./stripe.js";

/**
 * Il lato «soldi» del mercato (ADR-131): dove va il denaro di un'adozione e
 * come torna indietro. Lo stato Connect di un allevamento si scrive dentro la
 * sua casa; si legge dal ruolo del mercato, perché a pagare è un'altra casa.
 */

export async function saveConnectState(db: DbClient, accountId: string, state: ConnectState): Promise<void> {
  await withAccount(db, accountId, async (tx) => {
    const values = { ...state, updatedAt: new Date() };
    await tx
      .insert(breederPayoutAccounts)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: breederPayoutAccounts.accountId, set: values });
  });
}

export async function connectOf(db: DbClient, accountId: string): Promise<ConnectState | undefined> {
  return withAccount(db, accountId, async (tx) => {
    const [row] = await tx.select().from(breederPayoutAccounts).where(eq(breederPayoutAccounts.accountId, accountId));
    return row;
  });
}

export type Seller =
  /** la fonderia incassa da sé: Stripe o PayPal, senza Connect */
  | { kind: "foundry" }
  /** un allevamento col conto Connect attivo */
  | { kind: "connect"; destination: string }
  /** un allevamento che non incassa (ancora) online */
  | { kind: "offline" };

/** Chi vende, visto da chi compra. */
export async function sellerOf(db: DbClient, kennelAccountId: string): Promise<Seller> {
  return withMarket(db, async (tx) => {
    const [house] = await tx.select({ foundry: accounts.isFoundry }).from(accounts).where(eq(accounts.id, kennelAccountId));
    if (house?.foundry === true) return { kind: "foundry" as const };
    const [payout] = await tx
      .select({ id: breederPayoutAccounts.stripeAccountId, ok: breederPayoutAccounts.chargesEnabled })
      .from(breederPayoutAccounts)
      .where(eq(breederPayoutAccounts.accountId, kennelAccountId));
    return payout?.ok === true ? { kind: "connect" as const, destination: payout.id } : { kind: "offline" as const };
  });
}

/**
 * Il rimborso di un'adozione pagata online (ADR-126 §5). Vero se il PSP l'ha
 * accettato. Con Connect si stornano anche il trasferimento e la commissione.
 */
export async function refundPaidAdoption(
  deps: { db: DbClient; stripe?: StripeClient | undefined; paypal?: PayPalClient | undefined },
  input: { kennelAccountId: string; provider: string; ref: string },
): Promise<boolean> {
  const [, external] = input.ref.split(":");
  if (external === undefined) return false;
  try {
    if (input.provider === "stripe" && deps.stripe !== undefined) {
      // fuori dalla fonderia un incasso online passa solo da Connect
      const seller = await sellerOf(deps.db, input.kennelAccountId);
      await refundAdoption(deps.stripe, external, seller.kind !== "foundry");
      return true;
    }
    if (input.provider === "paypal" && deps.paypal !== undefined) {
      await deps.paypal.refundCapture(external);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
