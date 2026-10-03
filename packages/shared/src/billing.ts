import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Le parti pure dei pagamenti (ADR-125, ADR-130): la firma dei webhook di
 * Stripe e la decisione della ricarica automatica. Niente rete, niente
 * database: si provano con numeri e stringhe.
 */

/** Tolleranza sulla data della firma: oltre, è un evento riciclato (replay). */
export const STRIPE_SIGNATURE_TOLERANCE_SEC = 300;

/** Come Stripe firma: `t=<unix>,v1=<hex HMAC-SHA256 di "t.payload">`. */
export function signStripePayload(payload: string, secret: string, unixSeconds: number): string {
  const digest = createHmac("sha256", secret).update(`${String(unixSeconds)}.${payload}`).digest("hex");
  return `t=${String(unixSeconds)},v1=${digest}`;
}

/**
 * Vera se l'header porta almeno una firma `v1` valida per questo corpo, entro
 * la tolleranza. Il confronto è in tempo costante: il tempo della risposta non
 * deve dire quanti caratteri erano giusti.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  now: Date = new Date(),
  toleranceSec: number = STRIPE_SIGNATURE_TOLERANCE_SEC,
): boolean {
  if (header === undefined || secret === "") return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - timestamp) > toleranceSec) return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${String(timestamp)}.${payload}`).digest("hex"),
  );
  return parts
    .filter(([key]) => key === "v1")
    .some(([, value]) => {
      const given = Buffer.from(value ?? "");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export interface RechargeSettings {
  autoRecharge: boolean;
  /** sotto questo saldo si ricarica */
  thresholdMicros: number;
  /** quanto si ricarica ogni volta */
  amountMicros: number;
  /** quanto al massimo in un mese: il freno contro i cicli di spesa */
  monthlyCapMicros: number;
  /** c'è un metodo di pagamento salvato da usare senza la persona presente */
  hasSavedMethod: boolean;
}

export type RechargeDecision =
  | { recharge: true; amountMicros: number }
  | { recharge: false; reason: "off" | "above" | "no-method" | "cap" };

/**
 * Ricaricare adesso? (ADR-130 §5). Mai oltre il tetto del mese: se l'importo
 * pieno lo sfora, si ricarica il pezzo che ci sta, e se non ci sta niente si
 * aspetta il mese dopo.
 */
export function nextRechargeDecision(
  balanceMicros: number,
  settings: RechargeSettings,
  rechargedThisMonthMicros: number,
): RechargeDecision {
  if (!settings.autoRecharge) return { recharge: false, reason: "off" };
  if (balanceMicros >= settings.thresholdMicros) return { recharge: false, reason: "above" };
  if (!settings.hasSavedMethod) return { recharge: false, reason: "no-method" };
  const room = settings.monthlyCapMicros - rechargedThisMonthMicros;
  // sotto un euro non vale la commissione del PSP
  if (room < 1_000_000) return { recharge: false, reason: "cap" };
  return { recharge: true, amountMicros: Math.min(settings.amountMicros, room) };
}

/** Micro-euro in centesimi per il PSP, arrotondando per difetto: mai addebitare in più. */
export function microsToCents(micros: number): number {
  return Math.floor(micros / 10_000);
}

export function centsToMicros(cents: number): number {
  return cents * 10_000;
}
