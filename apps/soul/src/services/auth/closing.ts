import {
  accessTokens,
  accountLogins,
  accounts,
  pairingCodes,
  providerCredentials,
  sessions,
  withAccount,
  type DbClient,
} from "@ugo/db";
import { generateDataKey, wrapDataKey } from "@ugo/shared";
import { and, eq, isNull } from "drizzle-orm";

/**
 * La chiusura di un account (ADR-124 §9): la morte crittografica della casa,
 * come ADR-075 per il gosino.
 *
 * La DEK non si azzera: si SOSTITUISCE con una nuova che nessuno ha mai usato.
 * Più di un modulo, davanti a `wrapped_data_key` nullo, ripiega sulla chiave
 * madre (le case nate prima di ADR-019): azzerarla avrebbe riaperto proprio
 * quella porta. Con una chiave nuova, tutto ciò che era cifrato con la vecchia
 * resta byte senza senso, e niente ripiega su niente.
 *
 * Nella stessa transazione: le sessioni e i token revocati, l'email di chi
 * entrava e le chiavi dei provider cancellate, i codici d'abbinamento via.
 * L'abbonamento presso il PSP lo chiude il chiamante (ADR-125), prima: un
 * addebito dopo la chiusura sarebbe il torto peggiore.
 */
export async function closeAccount(db: DbClient, masterKey: Buffer, accountId: string): Promise<boolean> {
  return withAccount(db, accountId, async (tx) => {
    const now = new Date();
    const closed = await tx
      .update(accounts)
      .set({ closedAt: now, wrappedDataKey: wrapDataKey(generateDataKey(), masterKey) })
      .where(and(eq(accounts.id, accountId), isNull(accounts.closedAt)))
      .returning({ id: accounts.id });
    if (closed.length === 0) return false;
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)));
    await tx
      .update(accessTokens)
      .set({ revokedAt: now })
      .where(and(eq(accessTokens.accountId, accountId), isNull(accessTokens.revokedAt)));
    await tx.delete(accountLogins).where(eq(accountLogins.accountId, accountId));
    await tx.delete(providerCredentials).where(eq(providerCredentials.accountId, accountId));
    await tx.delete(pairingCodes).where(eq(pairingCodes.accountId, accountId));
    return true;
  });
}
