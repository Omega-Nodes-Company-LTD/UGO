import { describe, expect, it } from "vitest";
import {
  centsToMicros,
  microsToCents,
  nextRechargeDecision,
  signStripePayload,
  verifyStripeSignature,
  type RechargeSettings,
} from "./billing.js";

const SECRET = "whsec_prova";
const NOW = new Date("2026-10-03T10:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);

describe("la firma dei webhook di Stripe", () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';

  it("accetta la firma giusta", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, T), SECRET, NOW)).toBe(true);
  });

  it("rifiuta un corpo cambiato, un segreto diverso, un header assente", () => {
    const header = signStripePayload(body, SECRET, T);
    expect(verifyStripeSignature(body.replace("evt_1", "evt_2"), header, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, header, "whsec_altro", NOW)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, "t=abc,v1=00", SECRET, NOW)).toBe(false);
  });

  it("rifiuta una firma vecchia: è un evento riciclato", () => {
    const old = signStripePayload(body, SECRET, T - 301);
    expect(verifyStripeSignature(body, old, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, T - 299), SECRET, NOW)).toBe(true);
  });

  it("basta una v1 valida fra più firme (rotazione del segreto)", () => {
    const good = signStripePayload(body, SECRET, T).split(",")[1] ?? "";
    expect(verifyStripeSignature(body, `t=${String(T)},v1=deadbeef,${good}`, SECRET, NOW)).toBe(true);
  });
});

describe("la ricarica automatica", () => {
  const on: RechargeSettings = {
    autoRecharge: true,
    thresholdMicros: 2_000_000,
    amountMicros: 10_000_000,
    monthlyCapMicros: 30_000_000,
    hasSavedMethod: true,
  };

  it("ricarica sotto soglia, non sopra", () => {
    expect(nextRechargeDecision(1_000_000, on, 0)).toEqual({ recharge: true, amountMicros: 10_000_000 });
    expect(nextRechargeDecision(2_000_000, on, 0)).toEqual({ recharge: false, reason: "above" });
  });

  it("spenta o senza metodo salvato non ricarica", () => {
    expect(nextRechargeDecision(0, { ...on, autoRecharge: false }, 0)).toEqual({ recharge: false, reason: "off" });
    expect(nextRechargeDecision(0, { ...on, hasSavedMethod: false }, 0)).toEqual({
      recharge: false,
      reason: "no-method",
    });
  });

  it("non sfora il tetto del mese: ricarica il pezzo che ci sta", () => {
    expect(nextRechargeDecision(0, on, 25_000_000)).toEqual({ recharge: true, amountMicros: 5_000_000 });
    expect(nextRechargeDecision(0, on, 29_500_000)).toEqual({ recharge: false, reason: "cap" });
  });

  it("centesimi e micro-euro: mai addebitare in più", () => {
    expect(microsToCents(1_234_567)).toBe(123);
    expect(centsToMicros(123)).toBe(1_230_000);
  });
});
