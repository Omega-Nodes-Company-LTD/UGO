import { memories, type DbClient } from "@ugo/db";
import { awaitGlimpse, type GlimpseBody } from "./sceneReader.js";

/**
 * Lo sguardo che si ricorda (ADR-108).
 *
 * ADR-065 ha dato a UGO gli occhi per LEGGERE, e la lettura finisce dov'è
 * giusto che finisca: nella risposta, e da lì nella biografia cifrata. Ma «ti
 * ricordi cosa costava il PC rosso di stamattina?» chiede un'altra cosa —
 * chiede che quello sguardo sia diventato **un ricordo**, cioè una riga che
 * il recupero ibrido sa ripescare mesi dopo (ADR-022).
 *
 * Due differenze dal fratello maggiore, e sono il senso di questo file:
 *
 * 1. **Un frame, due occhi.** Finora l'OCR vedeva solo il fotogramma `fine` e
 *    il modello vision solo quello a 320px: due percorsi che non si
 *    incrociavano mai. Qui il frame si chiede UNA volta (`takeGlimpse` è
 *    distruttivo) e va a tutti e due — la descrizione dice *cos'era*, l'OCR
 *    dice *cosa c'era scritto*, e un prezzo su un cartellino sta nel secondo
 *    mentre «il PC rosso» sta nel primo.
 * 2. **Si scrive, e solo il testo.** Il ricordo nasce in chiaro (ADR-091,
 *    perché il braccio lessicale gira sul testo) e i pixel non toccano niente:
 *    finiscono nella stessa fine di sempre, consumati alla lettura. Un album
 *    è un'altra decisione, con un'altra durata (ADR-109).
 */

export type KeepsakeOutcome =
  | { outcome: "no_body" }
  | { outcome: "no_glimpse" }
  /** gli occhi ci sono ma non hanno detto niente: né una frase né una parola */
  | { outcome: "blind" }
  | { outcome: "kept"; text: string };

export interface SceneMemoryDeps {
  /** il corpo di QUESTO esemplare; una scatola, come per `SceneReader` */
  gateway: () => GlimpseBody | undefined;
  /** dove si scrive: già scopato sulla casa da chi costruisce */
  db: DbClient;
  gosinoId: string;
  /** tesseract sul servizio di percezione; assente o `undefined` = niente lettere */
  ocr?: ((imageBase64: string) => Promise<string | undefined>) | undefined;
  /** il modello vision locale; assente = niente frase */
  vision?: { describe: (imageBase64: string) => Promise<string | undefined> } | undefined;
  /** ADR-022: senza, il ricordo si ripesca dal solo braccio lessicale */
  embedder?: { embed: (texts: string[]) => Promise<number[][]> } | undefined;
  waitMs?: number | undefined;
  pollMs?: number | undefined;
}

/** Quanto testo letto entra in un ricordo: un ricordo non è un documento. */
const OCR_IN_MEMORY = 300;

export class SceneMemory {
  public constructor(private readonly deps: SceneMemoryDeps) {}

  public async keep(at: Date = new Date()): Promise<KeepsakeOutcome> {
    const body = this.deps.gateway();
    if (body?.hasBody() !== true) return { outcome: "no_body" };
    // `fine`: 640px. L'OCR su 320px vede macchie, non lettere (ADR-065), e
    // qui il frame serve anche a lui
    const held = await awaitGlimpse(body, {
      fine: true,
      waitMs: this.deps.waitMs,
      pollMs: this.deps.pollMs,
    });
    if (held === undefined) return { outcome: "no_glimpse" };

    // in parallelo: sono due servizi diversi, e chi aspetta è una persona
    const [seen, read] = await Promise.all([
      this.deps.vision?.describe(held) ?? Promise.resolve(undefined),
      this.deps.ocr?.(held) ?? Promise.resolve(undefined),
    ]);
    const text = composeKeepsake(seen, read);
    if (text === undefined) return { outcome: "blind" };

    const embedding = await this.embed(text);
    await this.deps.db.insert(memories).values({
      gosinoId: this.deps.gosinoId,
      kind: "episode",
      text,
      ...(embedding !== undefined && { embedding }),
      // da dove viene, senza il dove stava: un ricordo che non sa di essere
      // nato da uno sguardo si legge come una cosa che gli è stata detta
      sourceRefs: { from: "sguardo", at: at.toISOString() },
      validFrom: at,
    });
    return { outcome: "kept", text };
  }

  /** L'embedding, se c'è chi lo sa fare: un guasto lì non perde il ricordo. */
  private async embed(text: string): Promise<number[] | undefined> {
    if (this.deps.embedder === undefined) return undefined;
    try {
      const [vector] = await this.deps.embedder.embed([text]);
      return vector;
    } catch {
      return undefined;
    }
  }
}

/**
 * Le due metà in una frase sola, o `undefined` se non c'è nessuna metà.
 *
 * L'ordine non è estetico: la descrizione dice **cos'era** ed è ciò con cui
 * una persona ricorderà la scena («quello tutto rosso»); il testo letto è il
 * dettaglio che si va a cercare («749 euro»). Cercando «PC rosso» si trova la
 * riga, e dentro la riga c'è il prezzo.
 */
export function composeKeepsake(seen?: string, read?: string): string | undefined {
  const scene = seen?.trim() ?? "";
  const letters = (read ?? "").replace(/\s+/gu, " ").trim();
  const clipped =
    letters.length > OCR_IN_MEMORY ? `${letters.slice(0, OCR_IN_MEMORY)}…` : letters;
  if (scene === "" && clipped === "") return undefined;
  if (clipped === "") return `Ho guardato: ${scene}`;
  if (scene === "") return `Ho guardato, e c'era scritto: ${clipped}`;
  return `Ho guardato: ${scene} C'era scritto: ${clipped}`;
}

/**
 * Il gesto, forma chiusa come «leggi» e «cerca:» (ADR-063/065).
 *
 * Deve stare lontano da due vicini pericolosi: «ricordami di comprare il
 * latte» è un promemoria (ADR-028) e ha un compito dentro; «cosa ti ricordi
 * di marzo?» è una domanda alla memoria (ADR-086). Questo non ha né compito
 * né periodo: ha un **questo**, cioè la cosa che si ha davanti.
 */
export function keepsakeGestureOf(text: string): boolean {
  return /^(?:ugo[,!]?\s+)?(?:guarda\s+e\s+)?(?:ricordati|segnati|memorizza)\s+(?:bene\s+)?(?:questo|questa\s+cosa|quello\s+che\s+vedi|qui)\s*[.!?]*$/i.test(
    text.trim(),
  );
}

/** La risposta, in carattere, per ogni esito — e sono quattro, distinti. */
export function replyForKeepsake(kept: KeepsakeOutcome): string {
  switch (kept.outcome) {
    case "no_body":
      return "Non ho un corpo con gli occhi in questa stanza, grunf.";
    case "no_glimpse":
      return "Ci ho provato, ma la camera è spenta o il corpo non mi risponde.";
    case "blind":
      return "Ho guardato, ma non ci ho capito niente da ricordare. Grunf.";
    case "kept":
      return `Fatto, me lo segno. ${kept.text}`;
  }
}
