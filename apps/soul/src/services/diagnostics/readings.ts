import { httpProbe, type ProbeReading } from "./probes.js";

/**
 * Le sonde che devono **leggere** la risposta, non solo riceverla.
 *
 * Stanno fuori dal catalogo perché il catalogo è una lista dichiarativa — una
 * voce per container — e queste sono le due che hanno una logica dentro. E
 * tutte e due nascono dallo stesso difetto, visto due volte in un giorno:
 * **un `200` che non dice niente, letto come se dicesse tutto.**
 */

/** Da quanto un sogno mancato smette di essere «stanotte non è passato». */
const DREAM_STALE_H = 36;

/**
 * I QUATTRO mestieri di percezione, uno per uno.
 *
 * Il suo `/health` li dichiara già — `voice`, `face`, `stt`, `tts`, `ocr` — e
 * la sua docstring dice testualmente «cosa sa fare davvero, invece di un 200
 * che non dice niente». Questa sonda leggeva il 200 e buttava il resto:
 * riga verde, dieci millisecondi, e whisper morto dentro. Dal campo, ed è
 * costato un pomeriggio: «⚠ whisper non risponde» mentre il pannello diceva
 * che la dettatura era accesa, in due punti diversi e tutti e due verdi.
 *
 * Un mestiere caricato è ✓, uno no è ✗, e basta un ✗ perché la riga smetta di
 * dire «risponde». Non si distingue fra «non lo voglio» e «non è partito»
 * perché il container non lo sa: chi non vuole la dettatura svuota
 * `UGO_STT_MODEL`, e il risultato — qui dentro — è lo stesso di un
 * caricamento fallito. Il consiglio lo dice.
 */
export async function perceptionProbe(baseUrl: string): Promise<ProbeReading> {
  const reading = await httpProbe(baseUrl, "/health", { read: (body) => facultyLine(body) });
  if (!reading.reached || reading.detail === undefined) return reading;
  return reading.detail.includes("\u2717")
    ? {
        ...reading,
        state: "partial" as const,
        hint:
          "Il container è vivo ma un mestiere non è caricato. Se non l'hai spento tu " +
          "(UGO_STT_MODEL vuota, o niente tesseract), il caricamento è fallito all'avvio: " +
          "`docker compose logs percezione`. I pesi si scaricano al primo avvio (ADR-047).",
      }
    : reading;
}

/** `voce ✓ · volto ✓ · dettatura ✗ · Piper ✓ · OCR ✓` */
export function facultyLine(body: unknown): string | undefined {
  const health = body as Record<string, unknown> | null;
  if (health === null || typeof health !== "object") return undefined;
  const jobs: [string, string][] = [
    ["voce", "voice"],
    ["volto", "face"],
    ["dettatura", "stt"],
    ["Piper", "tts"],
    ["OCR", "ocr"],
  ];
  return jobs
    .map(([label, key]) => `${label} ${health[key] === true ? "\u2713" : "\u2717"}`)
    .join(" \u00b7 ");
}

/**
 * L'ultimo sogno, letto come una sonda — **e cosa lo sta aspettando**.
 *
 * La seconda metà è quella che serviva davvero. Arruolare una voce non crea
 * l'impronta: deposita un clip e scrive una richiesta, e l'impronta la
 * costruisce il sogno. Il chiosco e il pannello lo dicono («stanotte imparo
 * la tua voce»), ma lo dicono **una volta sola, al momento**: il giorno dopo
 * non c'è nessun posto dove leggere se quella richiesta è stata lavorata.
 *
 * Costo reale di quel buco: due giorni passati a credere che il
 * riconoscimento vocale fosse rotto, mentre era semplicemente in coda.
 */
export async function dreamReading(
  lastDream: () => Promise<Date | null>,
  pendingVoices: (() => Promise<number>) | undefined,
): Promise<ProbeReading> {
  try {
    const [at, waiting] = await Promise.all([
      lastDream(),
      pendingVoices === undefined ? Promise.resolve(0) : pendingVoices(),
    ]);
    const queue = waiting === 0 ? "" : ` · ${String(waiting)} ${waiting === 1 ? "voce" : "voci"} in attesa`;
    const hint =
      waiting === 0
        ? undefined
        : "Ci sono voci arruolate che aspettano un sogno per diventare impronte: finché non passa, " +
          "UGO non riconoscerà chi le ha depositate. Falle nascere adesso col bottone «Fallo sognare " +
          "adesso» nel Sommario, e ricontrolla: il numero deve tornare a zero.";
    if (at === null) {
      return {
        ms: 0,
        reached: false,
        detail: `non ha ancora sognato${queue}`,
        ...(hint !== undefined && { hint }),
      };
    }
    const hours = (Date.now() - at.getTime()) / 3_600_000;
    const stale = hours > DREAM_STALE_H;
    return {
      ms: 0,
      reached: true,
      // una coda che aspetta è un mezzo servizio: il sogno gira, ma quello che
      // sta aspettando non è ancora diventato niente
      ...((stale || waiting > 0) && { state: stale ? ("slow" as const) : ("partial" as const) }),
      detail: `ultimo sogno ${String(Math.round(hours))} ore fa${queue}`,
      ...(hint !== undefined && { hint }),
    };
  } catch {
    return { ms: 0, reached: false, detail: "non leggibile" };
  }
}
