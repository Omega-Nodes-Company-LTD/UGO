import { Canvas2dFace } from "../renderer.js";
import { type FaceRenderer, webglAvailable } from "./faceRenderer.js";
import { Webgl3dFace } from "./renderer3d.js";

export interface CreateFaceOptions {
  /** `?renderer=2d|3d` — forces one; absent means "3D if the device can" */
  force?: string | null;
  wander?: boolean;
}

/**
 * Picks the body. Order matters: an explicit request wins, then capability.
 *
 * Falling back is not a failure path to be logged and forgotten — on a device
 * without WebGL the 2D face is the product, and it must come up silently.
 */
export function createFace(
  canvas: HTMLCanvasElement,
  options: CreateFaceOptions = {},
): FaceRenderer {
  if (options.force === "2d") return new Canvas2dFace(canvas);
  if (options.force !== "3d" && !webglAvailable()) return new Canvas2dFace(canvas);
  try {
    return new Webgl3dFace(canvas, { wander: options.wander ?? true });
  } catch {
    // context creation can still fail after the probe said yes (lost context,
    // blocklisted driver): the creature appears anyway, flat
    return new Canvas2dFace(canvas);
  }
}
