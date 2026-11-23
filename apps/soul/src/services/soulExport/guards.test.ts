import { describe, expect, it } from "vitest";
import { archiveFileName, ExportLimiter, nameMatches } from "./guards.js";

describe("the typed confirmation", () => {
  it("is tolerant of case and spaces, which an on-screen keyboard gets wrong", () => {
    expect(nameMatches("  ugo  ", "Ugo")).toBe(true);
    expect(nameMatches("Maria  Luisa", "maria luisa")).toBe(true);
  });

  it("is intolerant of everything else", () => {
    expect(nameMatches("Ugo!", "Ugo")).toBe(false);
    expect(nameMatches("Ugh", "Ugo")).toBe(false);
  });

  it("never matches an empty name", () => {
    expect(nameMatches("", "")).toBe(false);
    expect(nameMatches("   ", "   ")).toBe(false);
  });
});

describe("the file name", () => {
  const day = new Date("2026-11-23T10:00:00Z");

  it("is ASCII and ends in .ugosoul", () => {
    expect(archiveFileName("Ugo", day)).toBe("ugo-2026-11-23.ugosoul");
    expect(archiveFileName("Gosìno Così / Strano", day)).toBe("gosino-cosi-strano-2026-11-23.ugosoul");
  });

  it("cannot carry a path, a quote or a header break out of the name", () => {
    const name = archiveFileName('../../etc/passwd"\r\nx-evil: 1', day);
    expect(name).toMatch(/^[a-z0-9-]+-2026-11-23\.ugosoul$/u);
  });

  it("has a fallback when the name has no usable character", () => {
    expect(archiveFileName("???", day)).toBe("gosino-2026-11-23.ugosoul");
  });
});

describe("the export limiter", () => {
  function clock() {
    let now = 1_000_000;
    return { now: () => now, advance: (ms: number) => { now += ms; } };
  }

  it("lets one export run at a time per house, because each holds a snapshot open", () => {
    const limiter = new ExportLimiter({ perWindow: 5, windowMs: 3_600_000 });
    expect(limiter.tryStart("casa-a")).toBe("ok");
    expect(limiter.tryStart("casa-a")).toBe("busy");
    expect(limiter.tryStart("casa-b")).toBe("ok"); // another house is not affected
    limiter.finish("casa-a");
    expect(limiter.tryStart("casa-a")).toBe("ok");
  });

  it("caps how many a house may start per window, and forgets when the window passes", () => {
    const time = clock();
    const limiter = new ExportLimiter({ perWindow: 2, windowMs: 3_600_000, now: time.now });
    for (let i = 0; i < 2; i += 1) {
      expect(limiter.tryStart("casa")).toBe("ok");
      limiter.finish("casa");
    }
    expect(limiter.tryStart("casa")).toBe("rate");
    time.advance(3_600_001);
    expect(limiter.tryStart("casa")).toBe("ok");
  });

  it("counts a failed attempt too: a loop of failures is still a loop", () => {
    const limiter = new ExportLimiter({ perWindow: 1, windowMs: 3_600_000 });
    expect(limiter.tryStart("casa")).toBe("ok");
    limiter.finish("casa");
    expect(limiter.tryStart("casa")).toBe("rate");
  });

  it("says how long to wait", () => {
    const time = clock();
    const limiter = new ExportLimiter({ perWindow: 1, windowMs: 60_000, now: time.now });
    limiter.tryStart("casa");
    limiter.finish("casa");
    time.advance(10_000);
    expect(limiter.retryAfterSeconds("casa")).toBe(50);
  });
});
