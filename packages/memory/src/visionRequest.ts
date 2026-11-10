/**
 * La richiesta che trasforma una foto in UNA frase, via OpenRouter (ADR-131).
 *
 * Funzione pura come `chatCompletionBody`: la forma si verifica con un unit
 * test, non leggendo una richiesta catturata. Stesse regole sui fornitori di
 * ADR-125 §3 — elenco chiuso, nessuna conservazione, nessun addestramento —
 * perché i pixel di una casa sono dati della casa (ADR-010).
 *
 * Il prompt è FISSO e viene prima dell'immagine: è l'unica parte che può
 * stare in cache, e un dato variabile lì la azzererebbe (regola 2).
 */

/**
 * Mistral Small 3.2: legge le immagini, scrive bene in italiano, ed è servito
 * da DeepInfra, Parasail e Mistral stessa — nessuno con sede in Cina.
 * Misurato su OpenRouter il 2026-11-09.
 */
export const DEFAULT_VISION_MODEL = "mistralai/mistral-small-3.2-24b-instruct";

/** Una frase: il resto lo dice la conversazione, non la descrizione. */
export const VISION_MAX_TOKENS = 80;

export const VISION_PROMPT =
  "Descrivi questa foto in UNA frase breve in italiano, come la racconterebbe " +
  "un maialino curioso a cui l'hanno appena mostrata. Solo la frase, niente altro.";

interface VisionContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface VisionCompletionBody {
  model: string;
  max_tokens: number;
  messages: { role: "user"; content: VisionContentPart[] }[];
  provider: {
    order: string[];
    only: string[];
    allow_fallbacks: true;
    zdr: true;
    data_collection: "deny";
  };
  usage: { include: true };
}

export function visionCompletionBody(
  model: string,
  providers: readonly string[],
  jpegBase64: string,
): VisionCompletionBody {
  return {
    model,
    max_tokens: VISION_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
        ],
      },
    ],
    provider: {
      order: [...providers],
      only: [...providers],
      allow_fallbacks: true,
      zdr: true,
      data_collection: "deny",
    },
    usage: { include: true },
  };
}
