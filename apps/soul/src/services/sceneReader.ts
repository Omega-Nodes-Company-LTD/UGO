import type { FaceGateway } from "./faceGateway.js";

/**
 * La lettura su gesto esplicito (ADR-065): «leggi», detto o scritto al
 * chiosco, e UGO guarda cosa c'è scritto davanti a lui.
 *
 * Decisione cliccata dal proprietario (2026-08-16): l'OCR si fa, ma SOLO su
 * gesto — mai in automatico. La superficie privacy è enorme (uno schermo può
 * mostrare qualunque cosa), quindi il giro è lo stesso dell'occhiata: i pixel
 * si CHIEDONO al corpo (`glimpse_ask`, qui in variante `fine` a 640px), si
 * leggono in casa con tesseract, e non si scrivono da nessuna parte — resta
 * il testo letto, cifrato in biografia come ogni scambio.
 *
 * A differenza dell'occhiata della ruminazione (due battiti, `sceneGlance`),
 * qui c'è una persona che ASPETTA la risposta: si chiede e si attende lo
 * sguardo dentro la stessa richiesta HTTP, con un tetto — un chiosco che non
 * risponde entro qualche secondo non risponderà, e la conversazione non deve
 * restare appesa.
 */

export type ReadOutcome =
  | { outcome: "no_body" }
  | { outcome: "no_glimpse" }
  | { outcome: "unreadable" }
  | { outcome: "read"; text: string };

/** quanto si aspetta il corpo, in tutto e a passi */
const WAIT_MS = 5_000;
const POLL_MS = 250;
/** uno sguardo buono per la lettura è uno appena arrivato, non uno di ieri */
const FRESH_MS = 15_000;

export interface SceneReaderDeps {
  /** il corpo di QUESTO esemplare; una scatola, perché il gateway nasce dopo */
  gateway: () => Pick<FaceGateway, "hasBody" | "askGlimpse" | "takeGlimpse"> | undefined;
  /** tesseract sul servizio di percezione; undefined = giù */
  ocr: (imageBase64: string) => Promise<string | undefined>;
  /** iniettabili nei test: nessuna attesa vera in un test di logica */
  waitMs?: number;
  pollMs?: number;
}

export class SceneReader {
  public constructor(private readonly deps: SceneReaderDeps) {}

  public async read(): Promise<ReadOutcome> {
    const gateway = this.deps.gateway();
    if (gateway?.hasBody() !== true) return { outcome: "no_body" };
    gateway.askGlimpse(true);
    const waitMs = this.deps.waitMs ?? WAIT_MS;
    const pollMs = this.deps.pollMs ?? POLL_MS;
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      const held = gateway.takeGlimpse(FRESH_MS);
      if (held === undefined) continue;
      const text = await this.deps.ocr(held);
      if (text === undefined) return { outcome: "unreadable" };
      if (text === "") return { outcome: "unreadable" };
      return { outcome: "read", text };
    }
    // camera spenta o corpo lento: il muso risponde a `glimpse_ask` solo a
    // camera accesa, quindi il silenzio è una risposta e va detta
    return { outcome: "no_glimpse" };
  }
}

/**
 * Il gesto: una forma chiusa in una lingua fissa, come «cerca:» (ADR-063).
 * Una frase che CONTIENE «leggi» non è il gesto — «ho letto un libro» non
 * deve accendere la camera.
 */
export function readGestureOf(text: string): boolean {
  return /^(?:ugo[,!]?\s+)?leggi(?:\s+(?:lo\s+)?schermo|mi\s+(?:questo|qui))?\s*[.!?]*$/i.test(
    text.trim(),
  );
}

/** La risposta, in italiano e in carattere, per ogni esito. */
export function replyForReading(seen: ReadOutcome): string {
  switch (seen.outcome) {
    case "no_body":
      return "Non ho un corpo con gli occhi in questa stanza, grunf.";
    case "no_glimpse":
      return "Ci ho provato, ma la camera è spenta o il corpo non mi risponde.";
    case "unreadable":
      return "Ho guardato, ma non riesco a leggerci niente. Grunf.";
    case "read":
      return `Grunf! C'è scritto:\n${seen.text.length > 900 ? `${seen.text.slice(0, 900)}…` : seen.text}`;
  }
}
