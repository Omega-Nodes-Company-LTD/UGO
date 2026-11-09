import { randomBytes, randomInt } from "node:crypto";
import { loginLinks, pairingCodes, type DbClient } from "@ugo/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hashToken, issueToken, type IssuedToken } from "./tenantAuth.js";

/**
 * Come un dispositivo entra in casa quando la casa sta sul web (ADR-127).
 *
 * Due porte, tutte e due a uso singolo e a scadenza, tutte e due salvate solo
 * come SHA-256: il codice di abbinamento (lo legge chi ha già il pannello e lo
 * scrive sul dispositivo nuovo) e il link via email (per il web, quando non
 * c'è un dispositivo già dentro da cui leggere un codice).
 */

/** Senza 0/O, 1/I/L, U: un codice detto a voce o letto storto non deve sbagliare casa. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 10 * 60_000;
export const LOGIN_LINK_TTL_MS = 15 * 60_000;
/** quanto vive la chiave nata da un link email: un mese, poi si rientra */
export const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

/** `ABCD-EFGH`: due gruppi da quattro, come si detta un numero di telefono. */
export function formatPairingCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Quello che una persona scrive diventa il codice canonico: maiuscole, niente
 * spazi né trattini. `undefined` se non può essere un codice — e allora non
 * si tocca nemmeno il database.
 */
export function normalizePairingCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s-]/gu, "");
  if (code.length !== PAIRING_CODE_LENGTH) return undefined;
  for (const char of code) if (!ALPHABET.includes(char)) return undefined;
  return code;
}

export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) code += ALPHABET.charAt(randomInt(ALPHABET.length));
  return code;
}

/** Il pannello chiede un codice: torna in chiaro una volta sola. */
export async function createPairingCode(
  db: DbClient,
  input: { accountId: string; createdByTokenId: string },
  now: Date = new Date(),
): Promise<{ code: string; expiresAt: Date }> {
  const code = generatePairingCode();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  await db.insert(pairingCodes).values({
    accountId: input.accountId,
    codeHash: hashToken(code),
    createdByTokenId: input.createdByTokenId,
    expiresAt,
  });
  return { code: formatPairingCode(code), expiresAt };
}

/**
 * Il dispositivo nuovo porta il codice: se è valido, non scaduto e mai usato,
 * diventa una chiave `member` della casa. Il codice si brucia nella stessa
 * istruzione che lo verifica, così due dispositivi con lo stesso codice non
 * entrano entrambi.
 */
export async function redeemPairingCode(
  db: DbClient,
  input: { code: string; deviceLabel: string },
  now: Date = new Date(),
): Promise<IssuedToken | undefined> {
  const code = normalizePairingCode(input.code);
  if (code === undefined) return undefined;
  const [claimed] = await db
    .update(pairingCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(pairingCodes.codeHash, hashToken(code)),
        isNull(pairingCodes.usedAt),
        gt(pairingCodes.expiresAt, now),
      ),
    )
    .returning({ id: pairingCodes.id, accountId: pairingCodes.accountId });
  if (claimed === undefined) return undefined;
  const issued = await issueToken(db, {
    accountId: claimed.accountId,
    role: "member",
    label: `dispositivo: ${input.deviceLabel}`,
  });
  await db.update(pairingCodes).set({ tokenId: issued.id }).where(eq(pairingCodes.id, claimed.id));
  return issued;
}

/** Il link per entrare con l'email: il segreto in chiaro va solo dentro l'email. */
export async function createLoginLink(
  db: DbClient,
  accountId: string,
  now: Date = new Date(),
): Promise<string> {
  const secret = randomBytes(32).toString("base64url");
  await db.insert(loginLinks).values({
    accountId,
    tokenHash: hashToken(secret),
    expiresAt: new Date(now.getTime() + LOGIN_LINK_TTL_MS),
  });
  return secret;
}

/**
 * Il link aperto diventa una chiave `owner` che scade in un mese: chi può
 * leggere la posta del titolare è il titolare, ed è la stessa autorità.
 */
export async function redeemLoginLink(
  db: DbClient,
  secret: string,
  label: string,
  now: Date = new Date(),
): Promise<IssuedToken | undefined> {
  if (!/^[A-Za-z0-9_-]{20,100}$/u.test(secret)) return undefined;
  const [claimed] = await db
    .update(loginLinks)
    .set({ usedAt: now })
    .where(
      and(
        eq(loginLinks.tokenHash, hashToken(secret)),
        isNull(loginLinks.usedAt),
        gt(loginLinks.expiresAt, now),
      ),
    )
    .returning({ accountId: loginLinks.accountId });
  if (claimed === undefined) return undefined;
  return issueToken(db, {
    accountId: claimed.accountId,
    role: "owner",
    label,
    expiresAt: new Date(now.getTime() + WEB_SESSION_TTL_MS),
  });
}
