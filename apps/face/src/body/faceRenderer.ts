import type { FaceState } from "@ugo/shared/face";
import type { PsycheVars } from "./pose.js";

/**
 * The seam.
 *
 * Two renderers live behind this interface — a WebGL body and the original 2D
 * canvas face. The 2D one is not legacy to be deleted: it is the fallback for
 * a device without WebGL, for a battery that cannot afford the GPU, and for
 * headless Chromium with no hardware acceleration (`apps/meet-face`, post-v1).
 *
 * `main.ts` talks only to this, which is why swapping the body did not touch
 * the socket, the offline queue, the senses or portable mode.
 */
export interface FaceRenderer {
  setState(state: FaceState): void;
  setMood(label: string, vars: Partial<PsycheVars>): void;
  setGaze(target: { x: number; y: number }): void;
  /** portable mode (§4.2): draw as little as the state allows */
  setLowPower(on: boolean): void;
  /** an event happened; react now instead of waiting for the idle timer */
  reflex(kind: string): void;
  start(): void;
  stop(): void;
  /** what the body is currently doing, for the e2e hooks */
  readonly debug: () => Record<string, string | number>;
}

/** True when this browser can actually give us a WebGL context. */
export function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return probe.getContext("webgl2") !== null || probe.getContext("webgl") !== null;
  } catch {
    return false;
  }
}
