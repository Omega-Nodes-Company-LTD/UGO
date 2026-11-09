import { budgetLedger, PRIME_ACCOUNT_ID, PRIME_GOSINO_ID, type DbClient } from "@ugo/db";
import { DEFAULT_LOCALE } from "@ugo/prompts";
import { z } from "zod";
import { chatMessages, MAX_TOKENS_BY_CHANNEL } from "./chatRequest.js";
import type { LlmChatRequest, LlmChatResult, ChatLlm, LlmClient } from "./llmClient.js";
import { computeLocalCostUsd } from "./pricing.js";

/**
 * La catena, accorciata da ADR-125: OpenRouter → voce di casa.
 *
 * Con un solo fornitore remoto, l'anello OpenRouter di ADR-095 e l'ultimo
 * anello (il provider) sono diventati la stessa cosa: `LlmClient`. Resta la
 * voce di casa, **solo se la casa l'ha accesa** (ADR-124), e solo come
 * soccorso quando OpenRouter non risponde: su un server senza GPU tiene la
 * parola fino a trenta secondi, e davanti sarebbe un ritardo, non un anello.
 *
 * I muri (tetto di famiglia, salvadanaio di ADR-072) li controlla
 * `LlmClient` PRIMA della chiamata: se OpenRouter solleva, i muri sono già
 * stati letti e passati, quindi il soccorso può parlare. Chi risponde paga:
 * la voce di casa scrive la sua riga col listino nominale.
 */

const ollamaResponseSchema = z.object({
  message: z.object({ content: z.string() }),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

/**
 * Il tetto dell'anello di casa: dodici secondi (ADR-124). Oltre una decina,
 * chi sta parlando non distingue «sta pensando» da «è morto».
 */
const DEFAULT_TIMEOUT_MS = 12_000;

export interface ChatChainOptions {
  db: DbClient;
  accountId?: string;
  gosinoId?: string;
  /** il fuso della CASA (ADR-050): decide il giorno della riga sul ledger */
  timezone?: string;
  locale?: string;
  /** la voce di casa: il soccorso quando OpenRouter non risponde */
  local: { baseUrl: string; model: string; timeoutMs?: number };
  /** OpenRouter, col suo budget guard: risponde per primo */
  remote: LlmClient;
  logger?: {
    info: (data: Record<string, unknown>, message: string) => void;
    warn: (data: Record<string, unknown>, message: string) => void;
  };
}

function localDate(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

export class ChatChain implements ChatLlm {
  private readonly accountId: string;
  private readonly gosinoId: string;
  private readonly timezone: string;
  private readonly locale: string;

  public constructor(private readonly options: ChatChainOptions) {
    this.accountId = options.accountId ?? PRIME_ACCOUNT_ID;
    this.gosinoId = options.gosinoId ?? PRIME_GOSINO_ID;
    this.timezone = options.timezone ?? "Europe/Rome";
    this.locale = options.locale ?? DEFAULT_LOCALE;
  }

  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    try {
      return await this.options.remote.chat(request, at);
    } catch (remoteError) {
      const startedAt = Date.now();
      const answer = await this.tryHome(request);
      if (answer === undefined) throw remoteError;
      await this.options.db.insert(budgetLedger).values({
        accountId: this.accountId,
        gosinoId: this.gosinoId,
        date: localDate(this.timezone, at),
        provider: "ollama",
        model: this.options.local.model,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut,
        costUsd: answer.costUsd.toFixed(6),
      });
      this.options.logger?.warn(
        { model: this.options.local.model, ms: Date.now() - startedAt },
        "openrouter did not answer: the home voice spoke instead",
      );
      return {
        text: answer.text,
        degraded: false,
        usage: {
          inputTokens: answer.tokensIn,
          outputTokens: answer.tokensOut,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
        costUsd: answer.costUsd,
      };
    }
  }

  private async tryHome(
    request: LlmChatRequest,
  ): Promise<{ text: string; tokensIn: number; tokensOut: number; costUsd: number } | undefined> {
    const { baseUrl, model, timeoutMs } = this.options.local;
    try {
      const response = await fetch(new URL("/api/chat", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          options: { num_predict: MAX_TOKENS_BY_CHANNEL[request.channel] },
          messages: chatMessages({
            channel: request.channel,
            locale: this.locale,
            ...(request.dynamicSystem !== undefined && { dynamicSystem: request.dynamicSystem }),
            ...(request.history !== undefined && { history: request.history }),
            userText: request.userText,
          }),
        }),
        signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const parsed = ollamaResponseSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      const text = parsed.data.message.content.trim();
      if (text === "") return undefined;
      const tokensIn = parsed.data.prompt_eval_count ?? 0;
      const tokensOut = parsed.data.eval_count ?? 0;
      return { text, tokensIn, tokensOut, costUsd: computeLocalCostUsd(tokensIn, tokensOut) };
    } catch {
      // giù o lenta anche lei: resta vero l'errore di OpenRouter, che risale
      return undefined;
    }
  }
}
