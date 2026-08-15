/**
 * Il pre-filtro anti-abuso della reception (ADR-051): un token bucket in
 * memoria, per processo — dichiaratamente. Smorza l'abuso grezzo prima che
 * tocchi la rete interna; il conto che vale sta in soul (ADR-055), su
 * Postgres, e questo non lo sostituisce. Chi un giorno scala la reception su
 * più processi rilegge ADR-051.
 */

const CAPACITY = 30;
const REFILL_PER_SECOND = 0.5; // 30 al minuto, di picco 30 di fila

interface Bucket {
  tokens: number;
  at: number;
}

const buckets = new Map<string, Bucket>();

export function allow(key: string, now: number = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, at: now };
  const elapsed = (now - bucket.at) / 1000;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_SECOND);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  // una mappa che cresce per sempre è un leak: potatura pigra oltre quota
  if (buckets.size > 10_000) {
    for (const [existing, value] of buckets) {
      if (now - value.at > 300_000) buckets.delete(existing);
    }
  }
  return true;
}
