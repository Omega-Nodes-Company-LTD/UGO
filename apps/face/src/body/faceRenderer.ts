import type { FaceState } from "@ugo/shared/face";
import type { PropKind, SceneProp } from "@ugo/shared/props";
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
/** Somebody who lives in the room this body is showing (ADR-036). */
export interface Resident {
  id: string;
  name: string;
  // `| undefined` explicitly: the roster arrives from zod, and
  // exactOptionalPropertyTypes makes "absent" and "present but undefined"
  // two different things
  traits?: Record<string, number> | undefined;
}

export interface FaceRenderer {
  /**
   * ADR-036: `who` names one creature in the room. Absent means all of them,
   * which is right for anything the ROOM experienced — a bang, a face at the
   * door — and is also exactly the old single-creature behaviour.
   */
  setState(state: FaceState, who?: string): void;
  setMood(label: string, vars: Partial<PsycheVars>, who?: string): void;
  /**
   * `null` = non c'è più nessuno da guardare. Non è la stessa cosa di `{0,0}`,
   * che vuol dire «guardami, sono davanti a te»: `startCameraGaze` distingueva
   * i due casi da sempre e `main.ts` li appiattiva scartando il `null`.
   */
  setGaze(target: { x: number; y: number } | null): void;
  /** portable mode (§4.2): draw as little as the state allows */
  setLowPower(on: boolean): void;
  /** an event happened; react now instead of waiting for the idle timer */
  reflex(kind: string, who?: string): void;
  /** who is in the room; a renderer that shows one may keep the first */
  setResidents?(residents: readonly Resident[]): void;
  /** somebody is speaking: the rest of the room turns to look at him */
  attendTo?(who: string | undefined): void;
  /**
   * ADR-056: cosa c'è nella stanza oltre a chi ci vive. Facoltativo come
   * `setResidents`: il corpo 2D non ha una stanza in cui posare niente, e una
   * scena che arriva a un muso che non sa disegnarla va ignorata, non fatta
   * fallire — è la stessa regola dei gesti sconosciuti (ADR-027).
   */
  setProps?(props: readonly SceneProp[]): void;
  /** ADR-056: uno di loro è andato da solo a usare un arredo. */
  onUsedProp?(listener: (who: string, kind: PropKind) => void): void;
  /**
   * ADR-058: chi è stato toccato **sul muso**, se qualcuno. Facoltativo: il
   * corpo 2D non ha un muso in una scena, e lì la mela semplicemente non c'è —
   * il che è meglio di una mela che si dà toccando ovunque.
   */
  snoutAt?(at: { x: number; y: number }): string | undefined;
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
