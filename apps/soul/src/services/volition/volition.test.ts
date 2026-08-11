import { describe, expect, it } from "vitest";
import { ACTS } from "./acts.js";
import { tidyQuestion } from "./curiosity.js";
import { MIN_GAP_MIN, type Gates, decide, isQuietHour } from "./decide.js";
import { type Vars, type WorldFacts, pressures } from "./pressures.js";

/**
 * Initiative is where UGO can bother a person, so the interesting assertions
 * are the ones about restraint: what he must NOT do, and when doing nothing
 * has to win.
 */

const CALM: Vars = {
  umore: 0.55,
  energia: 0.7,
  affetto: 0.5,
  noia: 0.4,
  stress: 0.3,
  curiosita: 0.5,
};

const JUST_SEEN: WorldFacts = {
  minutesAlone: 1,
  minutesSinceInitiative: 999,
  pendingDesires: 0,
  desireIsDue: false,
  bodyPresent: true,
  hour: 15,
};

const OPEN_GATES: Gates = {
  bodyPresent: true,
  localModelUp: true,
  hasDesire: false,
  hour: 15,
  minutesSinceInitiative: 999,
  sinceAct: {},
  enabled: true,
};

describe("pressures", () => {
  it("finds nothing worth doing in a calm creature who was just seen", () => {
    expect(pressures(CALM, JUST_SEEN)).toHaveLength(0);
  });

  it("grows loneliness with the clock, and never past one", () => {
    const at = (minutes: number): number =>
      pressures(CALM, { ...JUST_SEEN, minutesAlone: minutes }).find((p) => p.id === "loneliness")
        ?.magnitude ?? 0;
    expect(at(10)).toBeLessThan(at(60));
    expect(at(60)).toBeLessThan(at(600));
    expect(at(100_000)).toBeLessThanOrEqual(1);
  });

  it("misses you more when he is attached than when he is not", () => {
    const lonely = (affetto: number): number =>
      pressures({ ...CALM, affetto }, { ...JUST_SEEN, minutesAlone: 120 }).find(
        (p) => p.id === "loneliness",
      )?.magnitude ?? 0;
    expect(lonely(0.9)).toBeGreaterThan(lonely(0.1));
  });

  it("does not count boredom as a reason to act when nobody is there", () => {
    const bored = { ...CALM, noia: 0.95 };
    expect(pressures(bored, JUST_SEEN).some((p) => p.id === "boredom")).toBe(true);
    expect(
      pressures(bored, { ...JUST_SEEN, bodyPresent: false }).some((p) => p.id === "boredom"),
    ).toBe(false);
  });

  it("pushes harder when a desire names an hour and that hour is now", () => {
    const plain = pressures(CALM, { ...JUST_SEEN, pendingDesires: 1 });
    const due = pressures(CALM, { ...JUST_SEEN, pendingDesires: 1, desireIsDue: true });
    const magnitude = (list: ReturnType<typeof pressures>): number =>
      list.find((p) => p.id === "unspoken")?.magnitude ?? 0;
    expect(magnitude(due)).toBeGreaterThan(magnitude(plain));
  });

  it("always carries a reason with it", () => {
    for (const pressure of pressures(
      { ...CALM, noia: 0.9, stress: 0.9, curiosita: 0.9 },
      { ...JUST_SEEN, minutesAlone: 200, pendingDesires: 2 },
    )) {
      expect(pressure.because.length).toBeGreaterThan(4);
    }
  });
});

describe("decide", () => {
  const strong = pressures(
    { ...CALM, noia: 0.9, curiosita: 0.9 },
    { ...JUST_SEEN, minutesAlone: 240, pendingDesires: 1 },
  );

  it("does nothing at all when the owner turned initiative off", () => {
    expect(decide(strong, { ...OPEN_GATES, enabled: false })).toBeUndefined();
  });

  it("does nothing when there is nothing pushing", () => {
    expect(decide([], OPEN_GATES)).toBeUndefined();
  });

  it("keeps a floor between two initiatives", () => {
    expect(decide(strong, { ...OPEN_GATES, minutesSinceInitiative: MIN_GAP_MIN - 1 })).toBeUndefined();
  });

  it("acts when something is genuinely pushing, and says which pressure", () => {
    const decision = decide(strong, { ...OPEN_GATES, hasDesire: true });
    expect(decision).toBeDefined();
    expect(decision?.driver.because.length).toBeGreaterThan(0);
    expect(decision?.score).toBeGreaterThan(0);
  });

  it("will not open its mouth at night, but may still move an ear", () => {
    const night: Gates = { ...OPEN_GATES, hour: 3, hasDesire: true };
    expect(isQuietHour(3)).toBe(true);
    const decision = decide(strong, night);
    if (decision !== undefined) expect(decision.act.intrusive).toBeLessThanOrEqual(0.25);
    // and the loud ones are genuinely unreachable, not merely unlikely
    const loud = ACTS.filter((a) => a.intrusive > 0.25);
    for (const act of loud) {
      expect(decide(strong, night, [act])).toBeUndefined();
    }
  });

  it("refuses to invent a question when the local model is down", () => {
    const ask = ACTS.filter((a) => a.id === "askQuestion");
    expect(decide(strong, { ...OPEN_GATES, localModelUp: true }, ask)).toBeDefined();
    expect(decide(strong, { ...OPEN_GATES, localModelUp: false }, ask)).toBeUndefined();
  });

  it("refuses to say a desire it does not have", () => {
    const say = ACTS.filter((a) => a.id === "sayDesire");
    expect(decide(strong, { ...OPEN_GATES, hasDesire: true }, say)).toBeDefined();
    expect(decide(strong, { ...OPEN_GATES, hasDesire: false }, say)).toBeUndefined();
  });

  it("does not repeat the same act inside its cooldown", () => {
    const nudge = ACTS.filter((a) => a.id === "nudge");
    expect(decide(strong, OPEN_GATES, nudge)).toBeDefined();
    expect(decide(strong, { ...OPEN_GATES, sinceAct: { nudge: 1 } }, nudge)).toBeUndefined();
  });

  it("prefers the cheap act when the pressure is mild, and never the loudest", () => {
    const mild = pressures({ ...CALM, noia: 0.62 }, { ...JUST_SEEN, minutesAlone: 20 });
    const decision = decide(mild, { ...OPEN_GATES, hasDesire: true });
    if (decision !== undefined) expect(decision.act.intrusive).toBeLessThan(0.5);
  });

  it("every act declares what it is for: an act relieving nothing can never win", () => {
    for (const act of ACTS) {
      expect(Object.keys(act.relieves).length).toBeGreaterThan(0);
    }
  });
});

describe("tidyQuestion", () => {
  it("keeps a plain question and strips the model's scaffolding", () => {
    expect(tidyQuestion('"Com’è andata la consegna?"')).toBe("Com’è andata la consegna?");
    expect(tidyQuestion("1. Ti è piaciuta la cena di ieri?")).toBe("Ti è piaciuta la cena di ieri?");
    // a local model prefaces almost everything: the courtesy line is skipped,
    // not treated as the answer
    expect(tidyQuestion("Ecco la domanda:\nChi era quella persona in cucina?")).toBe(
      "Chi era quella persona in cucina?",
    );
  });

  it("rejects anything that is not actually a question", () => {
    expect(tidyQuestion("Oggi è stata una bella giornata.")).toBeUndefined();
    expect(tidyQuestion("")).toBeUndefined();
    expect(tidyQuestion("?")).toBeUndefined();
    expect(tidyQuestion(`${"a".repeat(400)}?`)).toBeUndefined();
  });
});
