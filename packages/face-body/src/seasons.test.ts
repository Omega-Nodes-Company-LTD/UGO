import { describe, expect, it } from "vitest";
import { seasonOf } from "./room3d.js";

/** Le stagioni del recinto: meteorologiche, di tre mesi in tre mesi. */
describe("seasonOf", () => {
  it("una data, una stagione, senza sorprese ai bordi", () => {
    expect(seasonOf(new Date("2026-03-01"))).toBe("primavera");
    expect(seasonOf(new Date("2026-05-31"))).toBe("primavera");
    expect(seasonOf(new Date("2026-08-16"))).toBe("estate");
    expect(seasonOf(new Date("2026-09-01"))).toBe("autunno");
    expect(seasonOf(new Date("2026-11-30"))).toBe("autunno");
    expect(seasonOf(new Date("2026-12-01"))).toBe("inverno");
    expect(seasonOf(new Date("2026-02-15"))).toBe("inverno");
  });
});
