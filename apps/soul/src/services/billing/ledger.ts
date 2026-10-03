import { billingEvents, creditLedger, creditSettings, subscriptions, withAccount, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, eq } from "drizzle-orm";
import { accountKey } from "../ai/keyring.js";

/**
 * Le scritture dell'incasso (ADR-125, ADR-130). Ogni funzione che tocca una
 * casa gira dentro `withAccount`: l'account arriva dai metadati che soul
 * stesso ha messo sull'oggetto del PSP, non da una ricerca fra le case.
 */

/** Vero se l'evento è nuovo; falso se è un doppione già lavorato. */
export async function firstTime(db: DbClient, provider: "stripe" | "paypal", eventId: string, type: string): Promise<boolean> {
  const inserted = await db
    .insert(billingEvents)
    .values({ provider, eventId, type })
    .onConflictDoNothing()
    .returning({ eventId: billingEvents.eventId });
  return inserted.length > 0;
}

export interface SubscriptionState {
  provider: "stripe" | "paypal";
  externalId: string;
  customerRef?: string | undefined;
  plan: "pro" | "allevamento";
  status: string;
  currentPeriodEnd?: Date | undefined;
  cancelAtPeriodEnd?: boolean | undefined;
}

export async function saveSubscription(db: DbClient, accountId: string, state: SubscriptionState): Promise<void> {
  await withAccount(db, accountId, async (tx) => {
    const values = {
      provider: state.provider,
      externalId: state.externalId,
      plan: state.plan,
      status: state.status,
      ...(state.customerRef !== undefined && { customerRef: state.customerRef }),
      ...(state.currentPeriodEnd !== undefined && { currentPeriodEnd: state.currentPeriodEnd }),
      ...(state.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: state.cancelAtPeriodEnd }),
      updatedAt: new Date(),
    };
    await tx
      .insert(subscriptions)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: subscriptions.accountId, set: values });
  });
}

/** Solo lo stato: un evento di aggiornamento non sempre ripete il piano. */
export async function updateSubscriptionStatus(
  db: DbClient,
  accountId: string,
  externalId: string,
  patch: { status: string; currentPeriodEnd?: Date | undefined; cancelAtPeriodEnd?: boolean | undefined },
): Promise<void> {
  await withAccount(db, accountId, async (tx) => {
    const [row] = await tx.select({ externalId: subscriptions.externalId }).from(subscriptions).where(eq(subscriptions.accountId, accountId));
    // un evento di un abbonamento vecchio non sovrascrive quello nuovo
    if (row?.externalId !== externalId) return;
    await tx
      .update(subscriptions)
      .set({
        status: patch.status,
        ...(patch.currentPeriodEnd !== undefined && { currentPeriodEnd: patch.currentPeriodEnd }),
        ...(patch.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: patch.cancelAtPeriodEnd }),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.accountId, accountId));
  });
}

/**
 * Il credito arriva. È l'UNICO punto che scrive un `topup` (ADR-130 §4):
 * dal webhook, mai dal ritorno del browser. Una ricarica automatica
 * accreditata chiude anche la sua attesa.
 */
export async function creditTopup(
  db: DbClient,
  accountId: string,
  input: { micros: number; ref: string; automatic: boolean },
): Promise<void> {
  await withAccount(db, accountId, async (tx) => {
    await tx.insert(creditLedger).values({
      accountId,
      kind: "topup",
      amountMicros: input.micros,
      ref: input.automatic ? `auto:${input.ref}` : input.ref,
    });
    if (input.automatic) {
      await tx
        .update(creditSettings)
        .set({ pendingSince: null, failures: 0, updatedAt: new Date() })
        .where(eq(creditSettings.accountId, accountId));
    }
  });
}

/**
 * Il metodo di pagamento per la ricarica automatica, cifrato con la DEK della
 * casa: muore con lei (ADR-124 §9).
 */
export async function saveMethod(
  db: DbClient,
  masterKey: Buffer,
  accountId: string,
  method: { provider: "stripe" | "paypal"; pointer: string },
): Promise<void> {
  await withAccount(db, accountId, async (tx) => {
    const sealed = encryptText(method.pointer, await accountKey(tx, accountId, masterKey));
    await tx
      .insert(creditSettings)
      .values({ accountId, provider: method.provider, paymentMethodEnc: sealed })
      .onConflictDoUpdate({
        target: creditSettings.accountId,
        set: { provider: method.provider, paymentMethodEnc: sealed, disabledReason: null, updatedAt: new Date() },
      });
  });
}

export async function readMethod(
  tx: DbClient,
  masterKey: Buffer,
  accountId: string,
  sealed: string | null,
): Promise<string | undefined> {
  if (sealed === null) return undefined;
  try {
    return decryptText(sealed, await accountKey(tx, accountId, masterKey));
  } catch {
    // una DEK sostituita (account chiuso) rende il puntatore illeggibile: bene così
    return undefined;
  }
}

/**
 * L'evento non è stato lavorato fino in fondo: si toglie il segno, così il
 * PSP lo riprova. Senza, un errore a metà renderebbe ogni retry un «doppione».
 */
export async function forgetEvent(db: DbClient, provider: "stripe" | "paypal", eventId: string): Promise<void> {
  await db.delete(billingEvents).where(and(eq(billingEvents.provider, provider), eq(billingEvents.eventId, eventId)));
}
