import { describe, expect, it } from "vitest";
import { Transcript, clockOf, type Store } from "./transcript.js";

/**
 * Pure logic over one injected storage seam, so a unit test is the honest
 * place (TESTING_PLAYBOOK §1). What is worth asserting is not "does it write"
 * but the four ways this can quietly lose or leak the conversation: the cap,
 * a corrupt file, a storage that refuses, and a second room.
 */

const memory = (seed?: Record<string, string>): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

const line = (text: string, at = 1_700_000_000_000) => ({ who: "Ugo", text, at, mine: false });

describe("the scroll of what was said", () => {
  it("survives being reopened, which is the whole point of keeping it", () => {
    const store = memory();
    new Transcript("k", store).add(line("Ho fame."));

    expect(new Transcript("k", store).all()).toEqual([line("Ho fame.")]);
  });

  it("keeps a tail, not an archive: conversation text in clear has a cap", () => {
    const store = memory();
    const scroll = new Transcript("k", store);
    for (let i = 0; i < 200; i += 1) scroll.add(line(`riga ${String(i)}`));

    const kept = scroll.all();
    expect(kept).toHaveLength(80);
    // the tail is the recent end — you go looking for what was just said
    expect(kept.at(-1)?.text).toBe("riga 199");
    expect(kept[0]?.text).toBe("riga 120");
  });

  it("caps what it read too, so an old oversized file does not stay oversized", () => {
    const store = memory({
      k: JSON.stringify(Array.from({ length: 500 }, (_, i) => line(`vecchia ${String(i)}`))),
    });

    expect(new Transcript("k", store).all()).toHaveLength(80);
  });

  it("starts empty on a corrupt file instead of taking the body down with it", () => {
    const store = memory({ k: "{non json" });

    expect(new Transcript("k", store).all()).toEqual([]);
  });

  it("drops entries that are not lines, whatever else is in that key", () => {
    const store = memory({ k: JSON.stringify([line("vera"), { who: "Ugo" }, null, 7]) });

    expect(new Transcript("k", store).all()).toEqual([line("vera")]);
  });

  it("loses the history, never the conversation, when storage refuses", () => {
    const full: Store = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const scroll = new Transcript("k", full);

    expect(() => {
      scroll.add(line("Ho fame."));
    }).not.toThrow();
    expect(scroll.all()).toEqual([line("Ho fame.")]);
  });

  it("empties for real: a cleared scroll is cleared on disk too", () => {
    const store = memory();
    const scroll = new Transcript("k", store);
    scroll.add(line("Ho fame."));

    scroll.clear();

    expect(scroll.all()).toEqual([]);
    expect(new Transcript("k", store).all()).toEqual([]);
  });

  it("keeps the kitchen and the study apart: two rooms are two conversations", () => {
    const store = memory();
    new Transcript("ugo_log_cucina", store).add(line("Ho fame."));
    const study = new Transcript("ugo_log_studio", store);

    expect(study.all()).toEqual([]);
  });
});

describe("the clock you scan for a lost sentence", () => {
  it("is hours and minutes, zero-padded so the column lines up", () => {
    // 09:05 local on any machine: built from the parts, not a fixed epoch
    const at = new Date(2026, 0, 2, 9, 5).getTime();

    expect(clockOf(at)).toBe("09:05");
  });
});
