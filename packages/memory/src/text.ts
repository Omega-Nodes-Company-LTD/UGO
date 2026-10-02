import type { DbClient } from "@ugo/db";
import { throughGate, type CreditTerms, type KeySource } from "./gate.js";
import { computeCost, type PriceSnapshot } from "./pricing.js";
import { ProviderAuthError, type CompletionAdapter, type CompletionRequest } from "./providers/types.js";

/**
 * Il pensiero corto e lo sguardo (ADR-122): ruminazione, consiglio,
 * curiosità, la storia della buonanotte, il giudice «non lo so» (ADR-107), il
 * riassunto della finestra sul mondo, la frase su una foto.
 *
 * Stavano su Ollama, fuori dal cancello perché «non costavano niente»: su CPU
 * costavano minuti. Ora passano dal provider della casa, quindi dal cancello —
 * e conservano il contratto di prima: **non lanciano mai**. Un modello
 * assente, una chiave rifiutata, un tetto raggiunto: `undefined`, e chi chiama
 * fa senza parole, come ha sempre saputo fare.
 */

/**
 * ADR-107: la temperatura è un parametro. Un giudice a 0.8 campiona il suo
 * verdetto; un cantastorie a 0 racconta sempre la stessa storia.
 */
export interface GenerateOptions {
  /** 0 = deterministico. Assente = 0.8. */
  temperature?: number;
}

export interface TextLlm {
  /** undefined quando non c'è niente da dire: mai un'eccezione */
  generate(prompt: string, maxTokens?: number, options?: GenerateOptions): Promise<string | undefined>;
  available(): Promise<boolean>;
}

export interface VisionLlm {
  /** una frase, o undefined: mai un'eccezione */
  describe(imageBase64: string): Promise<string | undefined>;
  available(): Promise<boolean>;
}

export interface GatedOptions {
  db: DbClient;
  adapter: CompletionAdapter;
  accountId: string;
  gosinoId: string;
  timezone: string;
  dailyBudgetUsd: number;
  keySource: KeySource;
  credit?: CreditTerms;
  priceSnapshot?: PriceSnapshot;
  onAuthFailure?: () => void;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

const VISION_PROMPT =
  "Descrivi questa scena in UNA frase breve in italiano, come la racconterebbe " +
  "un maialino curioso che guarda la stanza. Solo la frase, niente altro.";

/** Il tipo di un'immagine dai primi byte: il muso manda JPEG, ma non si giura. */
export function imageMediaType(base64: string): string {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

async function gated(options: GatedOptions, request: CompletionRequest): Promise<string | undefined> {
  try {
    const outcome = await throughGate(
      {
        db: options.db,
        accountId: options.accountId,
        gosinoId: options.gosinoId,
        timezone: options.timezone,
        dailyBudgetUsd: options.dailyBudgetUsd,
        keySource: options.keySource,
        ...(options.credit !== undefined && { credit: options.credit }),
        ...(options.logger !== undefined && { logger: options.logger }),
      },
      async () => {
        const answer = await options.adapter.complete(request);
        const usage = answer.usage ?? {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        };
        return {
          value: answer.text,
          provider: options.adapter.provider,
          model: options.adapter.model,
          usage: answer.usage,
          cost: computeCost(options.adapter.model, usage, {
            ...(answer.providerCostUsd !== undefined && { providerUsd: answer.providerCostUsd }),
            ...(options.priceSnapshot !== undefined && { snapshot: options.priceSnapshot }),
          }),
        };
      },
    );
    if (!outcome.ok) return undefined;
    const text = outcome.value.trim();
    return text === "" ? undefined : text;
  } catch (error) {
    if (error instanceof ProviderAuthError) options.onAuthFailure?.();
    options.logger?.warn(
      { accountId: options.accountId, provider: options.adapter.provider },
      "short thought failed: the caller goes on without words",
    );
    return undefined;
  }
}

export class GatedText implements TextLlm {
  public constructor(private readonly options: GatedOptions) {}

  public available(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public generate(
    prompt: string,
    maxTokens = 120,
    options: GenerateOptions = {},
  ): Promise<string | undefined> {
    return gated(this.options, {
      system: [],
      messages: [{ role: "user", content: prompt }],
      maxTokens,
      temperature: options.temperature ?? 0.8,
    });
  }
}

export class GatedVision implements VisionLlm {
  public constructor(private readonly options: GatedOptions) {}

  public available(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public describe(imageBase64: string): Promise<string | undefined> {
    return gated(this.options, {
      system: [],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mediaType: imageMediaType(imageBase64), data: imageBase64 },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
      maxTokens: 80,
      temperature: 0.7,
    });
  }
}

/** Nessuna testa configurata: si tace, e si sa di tacere. */
export const SILENT_TEXT: TextLlm = {
  generate: () => Promise.resolve(undefined),
  available: () => Promise.resolve(false),
};

export const BLIND_VISION: VisionLlm = {
  describe: () => Promise.resolve(undefined),
  available: () => Promise.resolve(false),
};
