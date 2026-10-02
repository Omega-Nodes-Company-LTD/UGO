import { accountLogins, accounts, sessions, type DbClient } from "@ugo/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { TenantContext } from "../tenantAuth.js";
import { digest, newSecret } from "./secrets.js";

/**
 * Le sessioni del browser (ADR-124). Il cookie porta un segreto; qui ne resta
 * lo SHA-256, come per i token (ADR-019). Scadenza scorrevole: trenta giorni
 * dall'ultima volta che ci si è visti, rinnovata al più una volta l'ora — una
 * scrittura per richiesta sarebbe un costo senza informazione.
 */

export const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;
const RENEW_AFTER_MS = 3_600_000;

export interface OpenedSession {
  /** il valore del cookie: esiste in chiaro solo nel `Set-Cookie` */
  token: string;
  id: string;
  expiresAt: Date;
}

export interface SessionSummary {
  id: string;
  label: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** questa è la sessione di chi sta guardando */
  current: boolean;
}

/** L'etichetta in parole, dal browser: si vede nel pannello, non dice chi. */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const browser = ua.includes('Firefox/')
    ? "Firefox"
    : ua.includes('Edg/')
      ? "Edge"
      : ua.includes('Chrome/')
        ? "Chrome"
        : ua.includes('Safari/')
          ? "Safari"
          : "browser";
  const system = ua.includes('Android')
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : ua.includes('Windows')
        ? "Windows"
        : ua.includes('Mac OS X')
          ? "macOS"
          : ua.includes('Linux')
            ? "Linux"
            : "";
  return system === "" ? browser : `${browser} su ${system}`;
}

export async function openSession(
  db: DbClient,
  input: { accountId: string; loginId: string; label: string },
  now: Date = new Date(),
): Promise<OpenedSession> {
  const token = newSecret();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  const [row] = await db
    .insert(sessions)
    .values({ ...input, tokenHash: digest(token), expiresAt, createdAt: now, lastSeenAt: now })
    .returning({ id: sessions.id });
  if (row === undefined) throw new Error("session not written");
  return { token, id: row.id, expiresAt };
}

/** Il cookie a un contesto, o undefined se non apre più niente. */
export async function resolveSession(
  db: DbClient,
  token: string,
  now: Date = new Date(),
): Promise<TenantContext | undefined> {
  if (token === "") return undefined;
  const [row] = await db
    .select({
      id: sessions.id,
      accountId: sessions.accountId,
      lastSeenAt: sessions.lastSeenAt,
      role: accountLogins.role,
    })
    .from(sessions)
    .innerJoin(accountLogins, eq(accountLogins.id, sessions.loginId))
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(
      and(
        eq(sessions.tokenHash, digest(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        isNull(accounts.closedAt),
      ),
    );
  if (row === undefined) return undefined;
  if (now.getTime() - row.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) })
      .where(eq(sessions.id, row.id));
  }
  return { accountId: row.accountId, role: row.role, tokenId: `session:${row.id}` };
}

/** L'id di sessione dal contesto, se il contesto viene da una sessione. */
export function sessionIdOf(tenant: TenantContext | null): string | undefined {
  return tenant?.tokenId.startsWith("session:") === true ? tenant.tokenId.slice(8) : undefined;
}

export async function listSessions(
  db: DbClient,
  accountId: string,
  currentId: string | undefined,
  now: Date = new Date(),
): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: sessions.id,
      label: sessions.label,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
    )
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((r) => ({ ...r, current: r.id === currentId }));
}

/** Revoca una sessione DI QUESTO account: l'id di un altro non trova niente. */
export async function revokeSession(db: DbClient, accountId: string, id: string): Promise<boolean> {
  const gone = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.accountId, accountId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return gone.length > 0;
}
