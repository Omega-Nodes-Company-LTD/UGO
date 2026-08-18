import { z } from "zod";
import { identityPrompt, receptionPrompt, rulesPrompt } from "@ugo/prompts";
import type { ChatLlm, LlmChatRequest, LlmChatResult } from "./llmClient.js";

/**
 * La voce di casa parla per prima (ADR-094).
 *
 * Fino a qui il modello locale era un'eccezione — le domande dell'iniziativa,
 * le storie — e la chat viveva sul provider. La direttiva del proprietario
 * ribalta la gerarchia: **il modello di casa è la prima scelta, il provider è
 * il soccorso**. È la forma coerente col progetto: local-first senza
 * asterisco, e l'«elettrodomestico di sé stesso» della Visione ha bisogno
 * esattamente di questo verso.
 *
 * Il contratto:
 *
 * 1. **stesso prompt, stessa disciplina.** Il locale riceve i medesimi
 *    blocchi di §5.5 — identità, regole (o reception), psiche+ricordi,
 *    cronaca — concatenati, perché Ollama non ha una cache di prompt da
 *    proteggere. Il ramo remoto conserva la sua, intatta.
 * 2. **il fallimento è silenzioso e loggato.** Modello giù, timeout,
 *    risposta vuota: si passa al provider senza dire niente a chi parla —
 *    ma la riga di log c'è, perché un ripiego invisibile anche a chi
 *    amministra è un guasto che nessuno riparerà.
 * 3. **il muro del budget resta dove si spende.** Una risposta locale non
 *    costa, non tocca il ledger e non sveglia la fame (ADR-072): il
 *    metabolismo riguarda il mangiare, e qui non si mangia. Budget e
 *    salvadanaio continuano a mordere nel ramo remoto, dov'è il denaro.
 */

const chatResponseSchema = z.object({
  message: z.object({ content: z.string() }),
});

/** Un tetto per canale, come il remoto: un modello locale senza tetto continua. */
const NUM_PREDICT_BY_CHANNEL = { home: 200, meeting: 300, api: 200, ticket: 400 } as const;

export interface LocalFirstOptions {
  baseUrl: string;
  model: string;
  /** oltre, il locale ha fallito e si passa al provider: la chat non può aspettare */
  timeoutMs?: number;
  locale?: string;
  logger?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

export class LocalFirstLlm implements ChatLlm {
  public constructor(
    private readonly remote: ChatLlm,
    private readonly options: LocalFirstOptions,
  ) {}

  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    const local = await this.tryLocal(request);
    if (local !== undefined) {
      this.options.logger?.info({ model: this.options.model }, "chat answered by the house model");
      // costo zero dichiarato, non omesso: chi legge i conti deve vedere lo zero
      return { text: local, degraded: false, costUsd: 0 };
    }
    this.options.logger?.warn(
      { model: this.options.model },
      "house model unavailable: falling back to the provider",
    );
    return this.remote.chat(request, at);
  }

  private async tryLocal(request: LlmChatRequest): Promise<string | undefined> {
    const locale = this.options.locale;
    const second = request.channel === "ticket" ? receptionPrompt(locale) : rulesPrompt(locale);
    const system = [identityPrompt(locale), second, request.dynamicSystem ?? ""]
      .filter((block) => block !== "")
      .join("\n\n");
    try {
      const response = await fetch(new URL("/api/chat", this.options.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          options: { num_predict: NUM_PREDICT_BY_CHANNEL[request.channel] },
          messages: [
            { role: "system", content: system },
            ...(request.history ?? []),
            { role: "user", content: request.userText },
          ],
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
      });
      if (!response.ok) return undefined;
      const parsed = chatResponseSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      const text = parsed.data.message.content.trim();
      return text === "" ? undefined : text;
    } catch {
      // giù, lento o assente: non è un errore della conversazione, è il
      // momento in cui il soccorso remoto esiste per intervenire
      return undefined;
    }
  }
}
