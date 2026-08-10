import { describe, expect, it, vi } from "vitest";
import { ScreenAwake } from "./wakelock.js";

/**
 * Pure logic around one browser API, so a unit test is the honest place
 * (TESTING_PLAYBOOK §1) — and the interesting behaviour is not "does it call
 * request", it is what happens on the paths a dock actually takes: a device
 * that refuses, and a tab that comes back after being hidden.
 */

const fakeSentinel = () => {
  const listeners: (() => void)[] = [];
  return {
    release: vi.fn(() => {
      for (const listener of listeners) listener();
      return Promise.resolve();
    }),
    addEventListener: (_type: "release", listener: () => void) => listeners.push(listener),
    fire: () => {
      for (const listener of listeners) listener();
    },
  };
};

describe("keeping the screen awake", () => {
  it("takes the lock once, not once per call", async () => {
    const request = vi.fn(() => Promise.resolve(fakeSentinel()));
    const awake = new ScreenAwake({ wakeLock: { request } });

    expect(await awake.acquire()).toBe(true);
    expect(await awake.acquire()).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(awake.held()).toBe(true);
  });

  it("carries on where the browser has no such API", async () => {
    const awake = new ScreenAwake({});
    expect(awake.available()).toBe(false);
    // a face that throws here is a face that does not start at all
    expect(await awake.acquire()).toBe(false);
  });

  it("carries on when the device refuses — low battery is not an error", async () => {
    const awake = new ScreenAwake({
      wakeLock: {
        request: () => Promise.reject(new Error("NotAllowedError")),
      },
    });
    expect(await awake.acquire()).toBe(false);
    expect(awake.held()).toBe(false);
  });

  it("knows the system took the lock back", async () => {
    const sentinel = fakeSentinel();
    const awake = new ScreenAwake({ wakeLock: { request: () => Promise.resolve(sentinel) } });
    await awake.acquire();
    sentinel.fire();
    expect(awake.held()).toBe(false);
  });

  it("re-takes it when the tab returns, because the system drops it on hide", async () => {
    const request = vi.fn(() => Promise.resolve(fakeSentinel()));
    const awake = new ScreenAwake({ wakeLock: { request } });
    let onVisibility: (() => void) | undefined;
    const doc = {
      visibilityState: "hidden" as DocumentVisibilityState,
      addEventListener: (_type: string, listener: () => void) => {
        onVisibility = listener;
      },
    };
    awake.watch(doc);

    doc.visibilityState = "visible";
    onVisibility?.();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
