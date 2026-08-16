/**
 * Gli occhi per le cose (gruppo 12): UGO vede COSA gli mostri.
 *
 * EfficientDet-Lite0 via MediaPipe, nel browser, sulla CPU del dispositivo —
 * la stessa strada del volto (`faceLocator.ts`): il video **non esce mai**,
 * è una libreria locale su un modello locale vendorizzato in `public/vision`.
 * Zero token per costruzione, e zero rete.
 *
 * Il ritmo è il compromesso con la batteria: un giro ogni tre secondi, non a
 * ogni fotogramma — per accorgersi che gli stai mostrando una mela non serve
 * il framerate, serve la pazienza.
 */

/** COCO parla inglese; UGO no. Solo ciò che ha senso in una casa: il resto
 * (persone incluse: di quelle si occupa il volto) si ignora. */
export const OBJECT_NAMES: Record<string, string> = {
  apple: "una mela",
  banana: "una banana",
  orange: "un'arancia",
  cup: "una tazza",
  bottle: "una bottiglia",
  "wine glass": "un bicchiere",
  book: "un libro",
  "cell phone": "un telefono",
  "teddy bear": "un orsetto",
  dog: "un cane",
  cat: "un gatto",
  laptop: "un computer",
  umbrella: "un ombrello",
  scissors: "delle forbici",
  "potted plant": "una pianta",
};

/** sotto questa confidenza una cosa non è una cosa, è un'ombra */
export const SPOT_MIN_CONFIDENCE = 0.55;
/** la stessa cosa non si ri-annuncia per dieci minuti: stupirsi due volte
 * della stessa tazza è il modo in cui la meraviglia diventa un tic */
export const SPOT_COOLDOWN_MS = 10 * 60_000;
const SPOT_EVERY_MS = 3_000;

export interface Spotted {
  /** la categoria, in snake_case: viaggia sul socket (max 24 char) */
  kind: string;
  /** come lo chiamerebbe lui: «una mela» */
  label: string;
}

/**
 * La memoria di ciò che ha appena visto: decide cosa vale un annuncio.
 * Pura — l'orologio è iniettato — e quindi provabile in Node, che è l'unica
 * parte di questo file che un test può guardare: MediaPipe è browser.
 */
export class ObjectMemory {
  private readonly lastSeen = new Map<string, number>();

  public constructor(private readonly clock: () => number = () => Date.now()) {}

  public notice(category: string, confidence: number): Spotted | undefined {
    if (confidence < SPOT_MIN_CONFIDENCE) return undefined;
    const label = OBJECT_NAMES[category];
    if (label === undefined) return undefined;
    const now = this.clock();
    const before = this.lastSeen.get(category);
    if (before !== undefined && now - before < SPOT_COOLDOWN_MS) return undefined;
    this.lastSeen.set(category, now);
    return { kind: category.replace(/\s+/g, "_"), label };
  }
}

export interface ObjectSpotterHandle {
  stop: () => void;
}

/**
 * Apre il rilevatore sul video della camera già accesa, o `undefined` se il
 * dispositivo non ce la fa — mai un'eccezione, come per il volto: un corpo
 * senza occhi per le cose è un corpo di ieri, non un corpo rotto.
 */
export async function startObjectSpotter(
  video: HTMLVideoElement,
  onSpotted: (spotted: Spotted) => void,
): Promise<ObjectSpotterHandle | undefined> {
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks("/vision");
    const detector = await vision.ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/vision/efficientdet_lite0.tflite" },
      runningMode: "VIDEO",
      scoreThreshold: SPOT_MIN_CONFIDENCE,
      maxResults: 3,
    });
    const memory = new ObjectMemory();
    let lastStamp = 0;
    const timer = setInterval(() => {
      if (video.videoWidth === 0) return;
      try {
        // il tempo va avanti anche se il video no (stessa riga del volto)
        const stamp = Math.max(performance.now(), lastStamp + 1);
        lastStamp = stamp;
        const found = detector.detectForVideo(video, stamp);
        for (const detection of found.detections) {
          const category = detection.categories[0];
          if (category === undefined) continue;
          const spotted = memory.notice(category.categoryName, category.score);
          if (spotted !== undefined) onSpotted(spotted);
        }
      } catch {
        // un fotogramma storto non spegne gli occhi
      }
    }, SPOT_EVERY_MS);
    return {
      stop: () => {
        clearInterval(timer);
        detector.close();
      },
    };
  } catch {
    // niente wasm, modello mancante: il corpo di ieri, non un corpo rotto
    return undefined;
  }
}
