import { accounts, providerCredentials, type DbClient } from "@ugo/db";
import type { Provider } from "@ugo/memory";
import { decryptText, encryptText, unwrapDataKey } from "@ugo/shared";
import { and, eq } from "drizzle-orm";

/**
 * Le chiavi della casa (ADR-122), cifrate con la DEK DELL'ACCOUNT.
 *
 * Tutto qui gira sulla connessione della casa (`withAccount`/`dbFor`): sotto
 * `ugo_app` la politica RLS lascia vedere solo le sue righe. Il segreto in
 * chiaro esce da questo modulo in un solo modo — `secrets()` per il resolver,
 * dentro il processo — e mai verso una rotta, un log o un export.
 */

export type KeyStatus = "unverified" | "ok" | "invalid";

export interface KeySummary {
  provider: Provider;
  hint: string;
  status: KeyStatus;
  verifiedAt: Date | null;
  updatedAt: Date;
}

/** Le ultime quattro: abbastanza per riconoscerla, troppo poche per usarla. */
export function hintOf(secret: string): string {
  const tail = secret.trim().slice(-4);
  return `…${tail}`;
}

/** La DEK dell'account; la chiave madre per chi è nato prima di ADR-019. */
export async function accountKey(db: DbClient, accountId: string, masterKey: Buffer): Promise<Buffer> {
  const [row] = await db
    .select({ wrapped: accounts.wrappedDataKey })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (row?.wrapped == null) return masterKey;
  return unwrapDataKey(row.wrapped, masterKey);
}

export async function saveKey(
  db: DbClient,
  accountId: string,
  masterKey: Buffer,
  input: { provider: Provider; secret: string; status: KeyStatus },
): Promise<KeySummary> {
  const key = await accountKey(db, accountId, masterKey);
  const secret = input.secret.trim();
  const now = new Date();
  const values = {
    secretEnc: encryptText(secret, key),
    hint: hintOf(secret),
    status: input.status,
    verifiedAt: input.status === "ok" ? now : null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(providerCredentials)
    .values({ accountId, provider: input.provider, ...values })
    .onConflictDoUpdate({
      target: [providerCredentials.accountId, providerCredentials.provider],
      set: values,
    })
    .returning();
  if (row === undefined) throw new Error("credential not written");
  return {
    provider: input.provider,
    hint: row.hint,
    status: row.status as KeyStatus,
    verifiedAt: row.verifiedAt,
    updatedAt: row.updatedAt,
  };
}

export async function listKeys(db: DbClient, accountId: string): Promise<KeySummary[]> {
  const rows = await db
    .select({
      provider: providerCredentials.provider,
      hint: providerCredentials.hint,
      status: providerCredentials.status,
      verifiedAt: providerCredentials.verifiedAt,
      updatedAt: providerCredentials.updatedAt,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.accountId, accountId));
  return rows.map((r) => ({ ...r, provider: r.provider as Provider, status: r.status as KeyStatus }));
}

export async function removeKey(db: DbClient, accountId: string, provider: Provider): Promise<boolean> {
  const gone = await db
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.accountId, accountId), eq(providerCredentials.provider, provider)))
    .returning({ id: providerCredentials.id });
  return gone.length > 0;
}

export async function markKeyInvalid(db: DbClient, accountId: string, provider: Provider): Promise<void> {
  await db
    .update(providerCredentials)
    .set({ status: "invalid", updatedAt: new Date() })
    .where(and(eq(providerCredentials.accountId, accountId), eq(providerCredentials.provider, provider)));
}

/** Solo per il resolver, dentro il processo: le chiavi in chiaro che valgono. */
export async function secrets(
  db: DbClient,
  accountId: string,
  masterKey: Buffer,
): Promise<Map<Provider, string>> {
  const rows = await db
    .select({
      provider: providerCredentials.provider,
      secretEnc: providerCredentials.secretEnc,
      status: providerCredentials.status,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.accountId, accountId));
  const usable = rows.filter((r) => r.status !== "invalid");
  if (usable.length === 0) return new Map();
  const key = await accountKey(db, accountId, masterKey);
  const out = new Map<Provider, string>();
  for (const row of usable) {
    try {
      out.set(row.provider as Provider, decryptText(row.secretEnc, key));
    } catch {
      // una chiave che non si apre (DEK distrutta, ADR-075/124) non esiste
    }
  }
  return out;
}
