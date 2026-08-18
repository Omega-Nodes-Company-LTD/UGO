import { budgetLedger, PRIME_ACCOUNT_ID, PRIME_GOSINO_ID, type DbClient } from "@ugo/db";
import { DEFAULT_LOCALE, identityPrompt, receptionPrompt, rulesPrompt } from "@ugo/prompts";
import { z } from "zod";
import {
  DEGRADED_REPLY,
  HUNGRY_REPLY,
  type LlmChatRequest,
  type LlmChatResult,
  type ChatLlm,
  type LlmClient,
} from "./llmClient.js";
import { computeLocalCostUsd } from "./pricing.js";

/**
 * La catena a più anelli (ADR-095): Ollama → OpenRouter → Anthropic.
 *
 * Evolve la voce di casa di ADR-094 su direttiva del proprietario: non più
 * un anello gratis davanti a uno a pagamento, ma una catena in cui **ogni
 * anello che risponde scrive la sua riga sul ledger col suo listino** e fa
 * girare il metabolismo (ADR-072) — casa a listino nominale (la corrente e
 * il ferro), OpenRouter col costo che dichiara lui, Anthropic come sempre.
 *
 * Le tre regole:
 *
 * 1. **i muri stanno all'ingresso.** Tetto di famiglia e salvadanaio si
 *    controllano UNA volta, prima del primo anello: a salvadanaio vuoto non
 *    parla nemmeno la voce quasi gratis, o la fame sarebbe una finzione.
 * 2. **stesso prompt, stessa disciplina** (da ADR-094): ogni anello riceve i
 *    blocchi di §5.5 — concatenati dove non c'è una cache da proteggere; il
 *    ramo Anthropic conserva la sua, intatta dentro `LlmClient`.
 * 3. **il fallimento è silenzioso e loggato**: giù, lento o vuoto si passa
 *    all'anello dopo senza dirlo a chi parla — ma la riga di log c'è.
 *
 * Il conto e la scrittura stanno nella stessa coda dei muri (la lezione
 * TOCTOU del budget guard): una conversazione per volta, per istanza.
 */

const ollamaResponseSchema = z.object({
  message: z.object({ content: z.string() }),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

const openRouterResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

/** Un tetto per canale, come il remoto: un modello senza tetto continua. */
const MAX_TOKENS_BY_CHANNEL = { home: 200, meeting: 300, api: 200, ticket: 400 } as const;

const DEFAULT_TIMEOUT_MS = 30_000;

/** Cosa un anello intermedio riporta quando ha risposto davvero. */
interface LinkAnswer {
  text: string;
  provider: "ollama" | "openrouter";
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ChatChainOptions {
  db: DbClient;
  accountId?: string;
  gosinoId?: string;
  /** il fuso della CASA (ADR-050): decide il giorno della riga sul ledger */
  timezone?: string;
  locale?: string;
  /** il primo anello: il modello di casa su Ollama */
  local: { baseUrl: string; model: string; timeoutMs?: number };
  /** il secondo anello, solo se la casa ha una chiave OpenRouter */
  openRouter?: { baseUrl?: string; apiKey: string; model: string; timeoutMs?: number };
  /**
   * L'ultimo anello E il portiere: i muri (tetto, salvadanaio) si leggono
   * dai suoi metodi pubblici, perché la logica del giorno locale e del
   * metabolismo vive lì e duplicarla sarebbe il modo di farla divergere.
   */
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
  /** una conversazione per volta: muri, chiamata e conto sono indivisibili */
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(private readonly options: ChatChainOptions) {
    this.accountId = options.accountId ?? PRIME_ACCOUNT_ID;
    this.gosinoId = options.gosinoId ?? PRIME_GOSINO_ID;
    this.timezone = options.timezone ?? "Europe/Rome";
    this.locale = options.locale ?? DEFAULT_LOCALE;
  }

  public async chat(request: LlmChatRequest, at: Date = new Date()): Promise<LlmChatResult> {
    const mine = this.queue.then(
      () => this.chatSerialized(request, at),
      () => this.chatSerialized(request, at),
    );
    this.queue = mine.catch(() => undefined);
    return mine;
  }

  private async chatSerialized(request: LlmChatRequest, at: Date): Promise<LlmChatResult> {
    const remote = this.options.remote;
    const [spent, budgetUsd] = await Promise.all([remote.spentTodayUsd(at), remote.dailyBudgetUsd()]);
    if (spent >= budgetUsd) {
      this.options.logger?.warn(
        { spentUsd: spent, budgetUsd, accountId: this.accountId },
        "daily LLM budget exceeded: declared degradation",
      );
      return { text: DEGRADED_REPLY, degraded: true };
    }
    const piggyBank = await remote.piggyBankUsd();
    if (piggyBank !== undefined && piggyBank <= 0) {
      this.options.logger?.warn(
        { piggyBankUsd: piggyBank, accountId: this.accountId, gosinoId: this.gosinoId },
        "empty piggy bank: the exemplar is hungry",
      );
      return { text: HUNGRY_REPLY, degraded: true };
    }

    const answer = (await this.tryOllama(request)) ?? (await this.tryOpenRouter(request));
    if (answer !== undefined) {
      await this.record(answer, at);
      this.options.logger?.info(
        { provider: answer.provider, model: answer.model, costUsd: answer.costUsd },
        "chat answered before the last link",
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

    this.options.logger?.warn(
      { local: this.options.local.model, openRouter: this.options.openRouter?.model ?? null },
      "no chain link answered: falling back to the provider",
    );
    return remote.chat(request, at);
  }

  /** I blocchi di §5.5 concatenati: qui non c'è una cache da proteggere. */
  private systemFor(request: LlmChatRequest): string {
    const second =
      request.channel === "ticket" ? receptionPrompt(this.locale) : rulesPrompt(this.locale);
    return [identityPrompt(this.locale), second, request.dynamicSystem ?? ""]
      .filter((block) => block !== "")
      .join("\n\n");
  }

  private messagesFor(request: LlmChatRequest): { role: string; content: string }[] {
    return [
      { role: "system", content: this.systemFor(request) },
      ...(request.history ?? []),
      { role: "user", content: request.userText },
    ];
  }

  private async tryOllama(request: LlmChatRequest): Promise<LinkAnswer | undefined> {
    const { baseUrl, model, timeoutMs } = this.options.local;
    try {
      const response = await fetch(new URL("/api/chat", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          options: { num_predict: MAX_TOKENS_BY_CHANNEL[request.channel] },
          messages: this.messagesFor(request),
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
      return {
        text,
        provider: "ollama",
        model,
        tokensIn,
        tokensOut,
        costUsd: computeLocalCostUsd(tokensIn, tokensOut),
      };
    } catch {
      // giù, lento o assente: non è un errore della conversazione, è il
      // momento per cui l'anello successivo esiste
      return undefined;
    }
  }

  private async tryOpenRouter(request: LlmChatRequest): Promise<LinkAnswer | undefined> {
    const link = this.options.openRouter;
    if (link === undefined) return undefined;
    try {
      const response = await fetch(
        new URL("/api/v1/chat/completions", link.baseUrl ?? "https://openrouter.ai"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${link.apiKey}`,
          },
          body: JSON.stringify({
            model: link.model,
            max_tokens: MAX_TOKENS_BY_CHANNEL[request.channel],
            messages: this.messagesFor(request),
            // il conteggio E il costo, dichiarati da lui: il listino di ogni
            // modello è suo, e copiarlo qui sarebbe il modo di farlo invecchiare
            usage: { include: true },
          }),
          signal: AbortSignal.timeout(link.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        },
      );
      if (!response.ok) return undefined;
      const parsed = openRouterResponseSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      const text = parsed.data.choices[0]?.message.content.trim() ?? "";
      if (text === "") return undefined;
      const usage = parsed.data.usage;
      if (usage?.cost === undefined) {
        // segnato a zero e dichiarato, come fa LlmClient: una riga a costo
        // zero è una bugia più piccola di nessuna riga
        this.options.logger?.warn(
          { model: link.model, accountId: this.accountId },
          "openrouter cost unreadable: ledger row will carry zero",
        );
      }
      return {
        text,
        provider: "openrouter",
        model: link.model,
        tokensIn: usage?.prompt_tokens ?? 0,
        tokensOut: usage?.completion_tokens ?? 0,
        costUsd: usage?.cost ?? 0,
      };
    } catch {
      return undefined;
    }
  }

  /** Chi risponde paga: la riga sul ledger è ciò che fa girare il metabolismo. */
  private async record(answer: LinkAnswer, at: Date): Promise<void> {
    await this.options.db.insert(budgetLedger).values({
      accountId: this.accountId,
      gosinoId: this.gosinoId,
      date: localDate(this.timezone, at),
      provider: answer.provider,
      model: answer.model,
      tokensIn: answer.tokensIn,
      tokensOut: answer.tokensOut,
      costUsd: answer.costUsd.toFixed(6),
    });
  }
}
