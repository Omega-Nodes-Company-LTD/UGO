import { pairingCodes, type DbClient } from "@ugo/db";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { issueToken } from "../tenantAuth.js";
import { keyed, newPairingCode } from "./secrets.js";

/**
 * L'abbinamento di un chiosco (ADR-121).
 *
 * Il muso non ha una tastiera comoda né una casella di posta: il pannello
 * mostra sei cifre, il muso le chiede una volta, e da lì in poi porta un
 * token `member` etichettato «chiosco: …» — revocabile dal pannello come ogni
 * altro token (`/v1/tokens`, ADR-100). Sei cifre si indovinano solo a forza: dieci minuti di vita,
 * un uso, e un rate limit per IP sulla porta (`RATE_RULES.pairByIp`).
 *
 * In database il codice sta come HMAC con un pepe derivato dalla chiave
 * madre: lo SHA-256 nudo di sei cifre si inverte con un milione di tentativi.
 */

const CODE_MINUTES = 10;
export const KIOSK_LABEL_PREFIX = "chiosco: ";

export interface PairingCode {
  code: string;
  expiresAt: Date;
}

export async function newPairing(
  db: DbClient,
  pepper: Buffer,
  input: { accountId: string; label: string },
  now: Date = new Date(),
): Promise<PairingCode> {
  // i codici scaduti liberano il loro posto nell'indice unico, e un codice
  // nuovo sostituisce quello precedente della stessa casa: uno alla volta
  await db
    .delete(pairingCodes)
    .where(or(lt(pairingCodes.expiresAt, now), eq(pairingCodes.accountId, input.accountId)));
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60_000);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newPairingCode();
    const written = await db
      .insert(pairingCodes)
      .values({ ...input, codeHash: keyed(pepper, code), expiresAt, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: pairingCodes.id });
    if (written.length > 0) return { code, expiresAt };
  }
  throw new Error("no free pairing code");
}

export interface Paired {
  accountId: string;
  token: string;
  tokenId: string;
}

/** Il codice in un token del chiosco, o undefined se non vale (più). */
export async function pair(
  db: DbClient,
  pepper: Buffer,
  code: string,
  now: Date = new Date(),
): Promise<Paired | undefined> {
  const [used] = await db
    .update(pairingCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(pairingCodes.codeHash, keyed(pepper, code.trim())),
        isNull(pairingCodes.usedAt),
        gt(pairingCodes.expiresAt, now),
      ),
    )
    .returning({ accountId: pairingCodes.accountId, label: pairingCodes.label });
  if (used === undefined) return undefined;
  const issued = await issueToken(db, {
    accountId: used.accountId,
    role: "member",
    label: `${KIOSK_LABEL_PREFIX}${used.label}`,
  });
  return { accountId: used.accountId, token: issued.token, tokenId: issued.id };
}
