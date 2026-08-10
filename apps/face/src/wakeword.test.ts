import { describe, expect, it } from "vitest";
import { WAKE_COOLDOWN_MS, WakeWord } from "./wakeword.js";

// The Vosk model needs the phone; the safety logic around it does not, and
// it is the part that fails in ways a device test would not catch.

function build(privacy = false) {
  const wakes: number[] = [];
  let clock = 10_000;
  const wake = new WakeWord({
    isPrivacyOn: () => privacy,
    onWake: () => wakes.push(clock),
    now: () => clock,
  });
  return { wake, wakes, advance: (ms: number) => (clock += ms) };
}

describe("wake word safety logic", () => {
  it("wakes on a confident detection", () => {
    const { wake, wakes } = build();
    expect(wake.handleDetection(0.9)).toBe(true);
    expect(wakes).toHaveLength(1);
  });

  it("ignores weak detections: a false positive is worse than a missed wake", () => {
    const { wake, wakes } = build();
    expect(wake.handleDetection(0.5)).toBe(false);
    expect(wakes).toHaveLength(0);
  });

  it("refuses to wake at all while privacy mode is on", () => {
    const { wake, wakes } = build(true);
    expect(wake.handleDetection(0.99)).toBe(false);
    expect(wakes).toHaveLength(0);
  });

  it("debounces repeated triggers, then allows the next one", () => {
    const { wake, wakes, advance } = build();
    expect(wake.handleDetection(0.9)).toBe(true);
    advance(WAKE_COOLDOWN_MS - 100);
    expect(wake.handleDetection(0.9)).toBe(false);
    advance(200);
    expect(wake.handleDetection(0.9)).toBe(true);
    expect(wakes).toHaveLength(2);
  });

  it("reports honestly that it is not running without a bundled engine", async () => {
    const { wake } = build();
    expect(await wake.start()).toBe(false);
    expect(wake.isRunning()).toBe(false);
  });

  it("starts when an engine is provided and routes its detections", async () => {
    let emit: ((confidence: number) => void) | undefined;
    const wakes: string[] = [];
    const wake = new WakeWord({
      engine: {
        start: (onDetected) => {
          emit = onDetected;
          return Promise.resolve(true);
        },
        stop: () => undefined,
      },
      isPrivacyOn: () => false,
      onWake: () => wakes.push("wake"),
      now: () => 100_000,
    });
    expect(await wake.start()).toBe(true);
    emit?.(0.95);
    expect(wakes).toEqual(["wake"]);
  });
});
