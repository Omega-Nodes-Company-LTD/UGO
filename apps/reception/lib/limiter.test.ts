import { describe, expect, it } from "vitest";
import { allow } from "./limiter";

/** Il pre-filtro (ADR-051): pura aritmetica, quindi unit test (regola 1). */
describe("the reception's pre-limiter", () => {
  it("lets a burst through and then says no", () => {
    const now = 1_000_000;
    let allowed = 0;
    for (let index = 0; index < 40; index += 1) {
      if (allow("bucket-a", now)) allowed += 1;
    }
    expect(allowed).toBe(30);
    expect(allow("bucket-a", now)).toBe(false);
  });

  it("refills with time instead of resetting", () => {
    const start = 2_000_000;
    for (let index = 0; index < 30; index += 1) allow("bucket-b", start);
    expect(allow("bucket-b", start)).toBe(false);
    // two seconds → one token back (0.5/s)
    expect(allow("bucket-b", start + 2_000)).toBe(true);
    expect(allow("bucket-b", start + 2_000)).toBe(false);
  });

  it("keeps buckets apart", () => {
    const now = 3_000_000;
    for (let index = 0; index < 31; index += 1) allow("bucket-c", now);
    expect(allow("bucket-c", now)).toBe(false);
    expect(allow("bucket-d", now)).toBe(true);
  });
});
