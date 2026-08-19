import { describe, expect, it } from "vitest";
import { GESTURE_BY_ID, GesturePlayer } from "./gestures.js";
import { REFLEX, nextDelayMs, tagWeights } from "./autonomy.js";
import { NEUTRAL_VARS, type PsycheVars } from "./pose.js";
import { PostureMixer, choosePosture } from "./posture.js";

const vars = (o: Partial<PsycheVars> = {}): PsycheVars => ({ ...NEUTRAL_VARS, ...o });

describe("choosePosture", () => {
  it("puts him down when he sleeps", () => {
    expect(choosePosture("sleeping", vars({ energia: 0.05 }), false, "standing")).toBe("lying");
    expect(choosePosture("sleeping", vars({ energia: 0.4 }), false, "standing")).toBe("crouching");
  });

  it("gets him up when spoken to, however tired he is", () => {
    expect(choosePosture("listening", vars({ energia: 0.02 }), false, "lying")).toBe("standing");
    expect(choosePosture("alert", vars({ energia: 0.02 }), false, "lying")).toBe("standing");
  });

  it("gets him up when he wants to walk: you cannot walk sitting", () => {
    expect(choosePosture("idle", vars({ energia: 0.3 }), true, "sitting")).toBe("standing");
  });

  it("makes him sit up before talking from the floor", () => {
    expect(choosePosture("talking", vars(), false, "lying")).toBe("sitting");
    // already sitting or standing: talking does not move him
    expect(choosePosture("talking", vars(), false, "sitting")).toBe("sitting");
  });

  it("sits him down when bored rather than leaving him standing there", () => {
    expect(choosePosture("idle", vars({ noia: 0.9, energia: 0.6 }), false, "standing")).toBe(
      "sitting",
    );
  });

  it("crosses freely with state: thinking does not force a posture", () => {
    expect(choosePosture("thinking", vars({ energia: 0.15 }), false, "standing")).toBe("lying");
    expect(choosePosture("thinking", vars({ energia: 0.9 }), false, "standing")).toBe("standing");
  });
});

describe("PostureMixer", () => {
  it("cross-fades instead of teleporting, and the weights stay a mix", () => {
    const mixer = new PostureMixer();
    mixer.step(0);
    mixer.set("sitting", 5000);
    const mid = mixer.step(5200);
    expect(mid.sitting).toBeGreaterThan(0);
    expect(mid.sitting).toBeLessThan(1);
    expect(mid.standing).toBeGreaterThan(0);
    const total = mid.standing + mid.sitting + mid.lying + mid.crouching;
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThan(1.1);
  });

  it("refuses to flap: a posture is held for a moment before the next", () => {
    const mixer = new PostureMixer();
    mixer.step(0);
    mixer.set("sitting", 4000);
    expect(mixer.current).toBe("sitting");
    mixer.set("lying", 4100); // too soon
    expect(mixer.current).toBe("sitting");
    mixer.set("lying", 9000);
    expect(mixer.current).toBe("lying");
  });

  it("settles eventually, so low-power mode can stop drawing", () => {
    const mixer = new PostureMixer();
    mixer.step(0);
    mixer.set("lying", 5000);
    for (let t = 5000; t < 12_000; t += 50) mixer.step(t);
    expect(mixer.settling).toBe(false);
  });
});

describe("autonomy", () => {
  it("never suggests a mood he cannot be in while asleep", () => {
    const w = tagWeights("sleeping", vars({ umore: 1, noia: 1 }));
    expect(w.happy).toBe(0);
    expect(w.bored).toBe(0);
    expect(w.sleepy).toBeGreaterThan(0);
  });

  it("leans on the theme the psyche is actually in", () => {
    const bored = tagWeights("idle", vars({ noia: 0.95, umore: 0.5 }));
    expect(bored.bored).toBeGreaterThan(bored.happy);
    const glad = tagWeights("idle", vars({ umore: 0.95, noia: 0.2 }));
    expect(glad.happy).toBeGreaterThan(glad.bored);
    const tense = tagWeights("idle", vars({ stress: 0.95 }));
    expect(tense.stress).toBeGreaterThan(tense.calm);
  });

  it("fidgets more when restless and less when flat", () => {
    const restless: number[] = [];
    const flat: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      restless.push(nextDelayMs("idle", vars({ noia: 1, energia: 1, stress: 0.8 })));
      flat.push(nextDelayMs("idle", vars({ noia: 0, energia: 0.1, stress: 0 })));
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(restless)).toBeLessThan(mean(flat));
    expect(Math.min(...restless, ...flat)).toBeGreaterThanOrEqual(1800);
  });

  it("maps every reflex to a gesture that exists", () => {
    for (const [event, id] of Object.entries(REFLEX)) {
      expect(GESTURE_BY_ID.has(id), `${event} → ${id}`).toBe(true);
    }
  });
});

describe("GesturePlayer", () => {
  it("runs a gesture and then reports itself free again", () => {
    const player = new GesturePlayer();
    expect(player.play("yawn", 0)).toBe(true);
    expect(player.busy).toBe(true);
    expect(Object.keys(player.sample(900)).length).toBeGreaterThan(0);
    player.sample(99_000);
    expect(player.busy).toBe(false);
    expect(player.lastPlayed).toBe("yawn");
  });

  it("refuses an id that is not in the catalogue instead of failing silently", () => {
    const player = new GesturePlayer();
    expect(player.play("nonesuch", 0)).toBe(false);
    expect(player.busy).toBe(false);
  });
});
