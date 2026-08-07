import type { GazeTarget } from "./renderer.js";

type GazeCallback = (target: GazeTarget | null) => void;

/**
 * Gaze sources for the pupils (PROGETTO §4.1 — l'effetto "mi vede").
 * Progressive enhancement: the native FaceDetector API when the platform has
 * it (camera-based, emits face_seen), pointer-follow as universal fallback.
 * Full MediaPipe Tasks Vision integration is an on-device step (needs the
 * phone + bundled model asset): tracked in docs/STATE.md.
 */

export function startPointerGaze(element: HTMLElement, onGaze: GazeCallback): void {
  const handler = (x: number, y: number): void => {
    const rect = element.getBoundingClientRect();
    onGaze({
      x: Math.max(-1, Math.min(1, ((x - rect.left) / rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((y - rect.top) / rect.height) * 2 - 1)),
    });
  };
  element.addEventListener("pointermove", (event) => {
    handler(event.clientX, event.clientY);
  });
  element.addEventListener("pointerdown", (event) => {
    handler(event.clientX, event.clientY);
  });
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

/** Camera + native FaceDetector: pupils track the face, presence is emitted. */
export async function startCameraGaze(
  onGaze: GazeCallback,
  onPresence: () => void,
): Promise<CameraGazeHandle | null> {
  const Ctor = (globalThis as { FaceDetector?: new () => FaceDetectorLike }).FaceDetector;
  if (Ctor === undefined) return null;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  const detector = new Ctor();
  let present = false;
  let running = true;

  const loop = async (): Promise<void> => {
    while (running) {
      try {
        const faces = await detector.detect(video);
        const face = faces[0];
        if (face !== undefined) {
          const box = face.boundingBox;
          if (!present) {
            present = true;
            onPresence();
          }
          onGaze({
            // mirror x: the camera faces the user
            x: -((box.x + box.width / 2) / video.videoWidth) * 2 + 1,
            y: ((box.y + box.height / 2) / video.videoHeight) * 2 - 1,
          });
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
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
