import type { FaceLocator } from "./gaze.js";

/**
 * La camera che si accende davvero (ADR-044).
 *
 * `gaze.ts` prevedeva tre livelli — un `FaceLocator` iniettato, il
 * `FaceDetector` nativo del browser, e il puntatore come rete — e nessuno
 * aveva mai iniettato il primo. Il secondo era un'API sperimentale di Chrome
 * poi ritirata, quindi in ogni browser spedito falliva e si finiva sempre sul
 * terzo: **la camera non si è mai accesa in vita sua** e le pupille seguivano
 * il dito. La forma della pipeline c'era, e dentro non c'era niente.
 *
 * Questo è il primo livello: BlazeFace via MediaPipe Tasks Vision, che gira
 * nel browser sulla CPU del dispositivo. Il video **non esce mai** dal
 * telefono — è una libreria locale su un modello locale, non un servizio.
 */

/** Dove stanno il wasm (copiato da vite) e il modello (vendorizzato). */
const WASM_PATH = "/vision";
const MODEL_PATH = "/vision/blaze_face_short_range.tflite";

/**
 * Sotto questa confidenza la faccia non è una faccia.
 *
 * Alta di proposito: uno sguardo che insegue le ombre del soggiorno è peggio
 * di uno sguardo fermo, perché sembra rotto invece che spento.
 */
const MIN_CONFIDENCE = 0.6;

/**
 * Apre MediaPipe, o restituisce `undefined` se il dispositivo non ce la fa.
 *
 * Mai un'eccezione: chi chiama ha già una rete che funziona sempre (il
 * puntatore), e un corpo che si rifiuta di partire perché il wasm non ha
 * caricato è un corpo peggiore di uno con lo sguardo semplice.
 */
export async function openFaceLocator(): Promise<FaceLocator | undefined> {
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
    const detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      runningMode: "VIDEO",
      minDetectionConfidence: MIN_CONFIDENCE,
    });

    // il tempo va avanti anche se il video no: MediaPipe rifiuta due frame
    // con lo stesso timestamp, e un `<video>` in pausa li ripete
    let lastStamp = 0;

    return {
      locate: (source) => {
        if (source.videoWidth === 0) return Promise.resolve(null);
        const stamp = Math.max(performance.now(), lastStamp + 1);
        lastStamp = stamp;
        const found = detector.detectForVideo(source, stamp);
        const face = biggest(found.detections);
        if (face === undefined) return Promise.resolve(null);
        const box = face.boundingBox;
        if (box === undefined) return Promise.resolve(null);
        // ADR-052: il rettangolo viaggia insieme al centro. Prima si teneva
        // solo il centro e le due righe dopo scartavano larghezza e altezza:
        // il ritaglio che serve a riconoscere qualcuno veniva calcolato e
        // buttato via a ogni fotogramma — la stessa famiglia del difetto della
        // voce di ADR-045.
        return Promise.resolve({
          x: (box.originX + box.width / 2) / source.videoWidth,
          y: (box.originY + box.height / 2) / source.videoHeight,
          width: box.width / source.videoWidth,
          height: box.height / source.videoHeight,
        });
      },
      close: () => {
        detector.close();
      },
    };
  } catch {
    // niente wasm, niente WebGL, un permesso negato: il puntatore resta
    return undefined;
  }
}

/**
 * Chi guardare quando ci sono più facce: la più grande, cioè la più vicina.
 *
 * Deve essere una regola sola e stabile — alternare fra due persone a ogni
 * fotogramma è la cosa che fa sembrare rotta una creatura che funziona.
 */
interface Box {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

function biggest<T extends { boundingBox?: Box | undefined }>(
  detections: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestArea = 0;
  for (const detection of detections) {
    const box = detection.boundingBox;
    if (box === undefined) continue;
    const area = box.width * box.height;
    if (area > bestArea) {
      best = detection;
      bestArea = area;
    }
  }
  return best;
}
