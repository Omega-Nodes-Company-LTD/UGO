import type { GazeTarget } from "./renderer.js";

type GazeCallback = (target: GazeTarget | null) => void;

/**
 * Gaze sources for the pupils (PROGETTO §4.1 — l'effetto "mi vede").
 *
 * Three tiers, tried in order:
 *  1. an injected {@link FaceLocator} — this is where MediaPipe Tasks Vision
 *     plugs in on the phone (it needs a bundled ~2 MB BlazeFace asset and a
 *     real camera, so it is provided by the device build rather than
 *     hard-coded here);
 *  2. the platform's native FaceDetector, where it exists;
 *  3. pointer-follow, which always works and keeps the face alive in a
 *     browser.
 * Presence is emitted only on the transition into "someone is there", never
 * on every frame.
 */

/**
 * Minimal contract a face detector must satisfy: given a video frame, return
 * the centre of the most prominent face in normalized [0,1] coordinates, or
 * null when nobody is in view.
 */
export interface FaceLocator {
  locate: (source: HTMLVideoElement) => Promise<{ x: number; y: number } | null>;
  close?: () => void;
}

/**
 * Il ripiego universale: le pupille seguono il puntatore.
 *
 * Due cambiamenti, entrambi per il chiosco.
 *
 * Restituisce un modo per spegnersi: prima non lo faceva, e `main.ts` lo
 * avviava **incondizionatamente all'avvio**. Quando poi la camera partiva
 * c'erano due sorgenti a scrivere sulle stesse pupille, e vinceva l'ultima che
 * aveva parlato.
 *
 * E ascolta solo `pointermove`, non più `pointerdown`: su un touch il tocco
 * **è** la carezza (`main.ts` lo intercetta già per il `tap`), e uno sguardo
 * che scatta verso il dito a ogni carezza non è uno sguardo, è un riflesso
 * dell'interfaccia.
 */
export function startPointerGaze(element: HTMLElement, onGaze: GazeCallback): CameraGazeHandle {
  const handler = (event: PointerEvent): void => {
    const rect = element.getBoundingClientRect();
    onGaze({
      x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
    });
  };
  element.addEventListener("pointermove", handler);
  return {
    stop: () => {
      element.removeEventListener("pointermove", handler);
    },
  };
}

interface DetectedFaceLike {
  boundingBox: { x: number; y: number; width: number; height: number };
}
interface FaceDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedFaceLike[]>;
}

export interface CameraGazeHandle {
  stop: () => void;
}

/** Wraps the platform FaceDetector in the FaceLocator contract, if present. */
function nativeLocator(): FaceLocator | null {
  const Ctor = (globalThis as { FaceDetector?: new () => FaceDetectorLike }).FaceDetector;
  if (Ctor === undefined) return null;
  const detector = new Ctor();
  return {
    locate: async (video) => {
      const face = (await detector.detect(video))[0];
      if (face === undefined) return null;
      const box = face.boundingBox;
      return {
        x: (box.x + box.width / 2) / video.videoWidth,
        y: (box.y + box.height / 2) / video.videoHeight,
      };
    },
  };
}

/**
 * Camera gaze: pupils track the located face, presence is emitted on entry.
 * Pass `locator` to use MediaPipe on the device; omit it to try the native
 * detector. Returns null when neither is available, so the caller can fall
 * back to pointer-follow.
 */
export async function startCameraGaze(
  onGaze: GazeCallback,
  onPresence: () => void,
  locator?: FaceLocator,
): Promise<CameraGazeHandle | null> {
  const detector = locator ?? nativeLocator();
  if (detector === null) return null;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  let present = false;
  let running = true;

  const loop = async (): Promise<void> => {
    while (running) {
      try {
        const centre = await detector.locate(video);
        if (centre !== null) {
          if (!present) {
            present = true;
            onPresence();
          }
          // mirror x: the camera faces the user, so left is right
          onGaze({ x: -(centre.x * 2 - 1), y: centre.y * 2 - 1 });
        } else {
          present = false;
          onGaze(null);
        }
      } catch {
        // detector hiccup: keep looping
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };
  void loop();
  return {
    stop: () => {
      running = false;
      detector.close?.();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
