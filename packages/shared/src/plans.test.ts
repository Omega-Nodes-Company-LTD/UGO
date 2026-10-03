import { describe, expect, it } from "vitest";
import { effectivePlan, PLANS, withinQuota } from "./plans.js";

describe("i piani (ADR-125)", () => {
  it("free: un gosino, una stanza, niente voce né sogno", () => {
    expect(PLANS.free).toMatchObject({ gosini: 1, rooms: 1, voice: false, dream: false });
  });

  it("vendere in vetrina è solo dell'allevamento", () => {
    expect(PLANS.pro.breedingSales).toBe(false);
    expect(PLANS.allevamento.breedingSales).toBe(true);
  });

  it("il tetto conta quelli che ci sono già", () => {
    expect(withinQuota("free", "gosini", 0)).toBe(true);
    expect(withinQuota("free", "gosini", 1)).toBe(false);
    expect(withinQuota("pro", "rooms", 500)).toBe(true);
  });

  it("vale l'abbonamento vivo, altrimenti la concessione, altrimenti free", () => {
    expect(effectivePlan({})).toBe("free");
    expect(effectivePlan({ subscription: { plan: "pro", status: "active" } })).toBe("pro");
    expect(effectivePlan({ subscription: { plan: "pro", status: "canceled" } })).toBe("free");
    expect(effectivePlan({ subscription: { plan: "pro", status: "past_due" } })).toBe("pro");
    expect(effectivePlan({ grant: "allevamento" })).toBe("allevamento");
  });

  it("fra abbonamento e concessione vince il più ricco", () => {
    expect(effectivePlan({ subscription: { plan: "pro", status: "active" }, grant: "allevamento" })).toBe(
      "allevamento",
    );
    expect(effectivePlan({ subscription: { plan: "allevamento", status: "active" }, grant: "pro" })).toBe(
      "allevamento",
    );
    expect(effectivePlan({ grant: "inventato" })).toBe("free");
  });
});
