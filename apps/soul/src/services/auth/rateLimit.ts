import { loginLinks, pairingCodes, rateLimits, sessions, type DbClient } from "@ugo/db";
import { and, isNotNull, lt, or, sql } from "drizzle-orm";
import { keyed } from "./secrets.js";

/**
 * Il rate limit pubblico (ADR-121): una finestra fissa per (secchio, chiave),
 * un solo `insert … on conflict do update … returning`. Atomico senza lock,
 * vale per ogni processo e sopravvive al riavvio — un limite in memoria lo
 * azzera chi sa far ripartire il server.
 *
 * La chiave è un HMAC: un IP o un'email non finiscono mai in chiaro qui.
 */

export interface RateRule {
  /** quanti colpi per finestra */
  limit: number;
  windowSec: number;
}

/** I limiti delle porte pubbliche: pochi, perché dietro c'è una mail o un codice. */
export const RATE_RULES = {
  /** link d'accesso per indirizzo IP */
  linkByIp: { limit: 10, windowSec: 3600 },
  /** link d'accesso per email: niente bombardamento di una casella */
  linkByEmail: { limit: 3, windowSec: 900 },
  /** tentativi di abbinamento per IP: sei cifre si indovinano solo a forza */
  pairByIp: { limit: 10, windowSec: 900 },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE_RULES;

export class RateLimiter {
  public constructor(
    private readonly db: DbClient,
    private readonly pepper: Buffer,
  ) {}

  /** true se il colpo sta nel limite; lo conta comunque. */
  public async allow(bucket: RateBucket, key: string, now: Date = new Date()): Promise<boolean> {
    const rule = RATE_RULES[bucket];
    const windowMs = rule.windowSec * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const [row] = await this.db
      .insert(rateLimits)
      .values({ bucket, keyHash: keyed(this.pepper, key), windowStart, hits: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.bucket, rateLimits.keyHash, rateLimits.windowStart],
        set: { hits: sql`${rateLimits.hits} + 1` },
      })
      .returning({ hits: rateLimits.hits });
    return (row?.hits ?? Number.POSITIVE_INFINITY) <= rule.limit;
  }
}

/**
 * Le porte dell'accesso lasciano righe che non servono più: finestre di rate
 * limit chiuse, link e codici scaduti, sessioni scadute o revocate. Un giorno
 * di margine, per poter ancora dire «quel link era scaduto» a chi chiede.
 * Minimizzazione (GDPR art. 5): un link contiene l'email cifrata, e dopo il
 * suo quarto d'ora non ha più ragione di esistere.
 */
export async function sweepAccess(db: DbClient, now: Date = new Date()): Promise<void> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, dayAgo));
  await db.delete(loginLinks).where(lt(loginLinks.expiresAt, dayAgo));
  await db.delete(pairingCodes).where(lt(pairingCodes.expiresAt, dayAgo));
  await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, dayAgo), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, dayAgo))));
}
