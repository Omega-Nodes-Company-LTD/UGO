import { identityPrompt, receptionPrompt, rulesPrompt } from "@ugo/prompts";

/**
 * La forma della richiesta a un modello, separata da chi la spedisce
 * (ADR-125): è una funzione pura, e quello che prima si verificava leggendo
 * la richiesta catturata da uno stub di rete si verifica qui, con un unit test.
 *
 * L'ordine di §5.5 (regola 2) vive in questo file: il primo messaggio di
 * sistema è identità + regole, identico byte per byte per lingua e canale, e
 * nient'altro. Su OpenRouter la cache è a prefisso automatico, quindi un dato
 * variabile interpolato qui la azzererebbe senza un errore.
 */

export const OPENROUTER_URL = "https://openrouter.ai";
export const DEFAULT_CHAT_MODEL = "deepseek/deepseek-v4-flash";
/**
 * In ordine di preferenza, ed è un ordine misurato (ADR-125): DeepInfra e
 * Azure fanno il caching del prefisso, Parasail e DigitalOcean no. Nessun
 * fornitore con sede in Cina.
 */
export const DEFAULT_PROVIDERS: readonly string[] = ["DeepInfra", "Azure", "Parasail", "DigitalOcean"];

// `ticket` (ADR-052): technical answers with repo context need more room.
// `phone` (ADR-128): a telephone turn is SPOKEN — two or three short
// sentences, because every character becomes seconds of synthesis and cents.
export const MAX_TOKENS_BY_CHANNEL = {
  home: 200,
  meeting: 300,
  api: 200,
  ticket: 400,
  phone: 120,
} as const;

export type ChatChannel = keyof typeof MAX_TOKENS_BY_CHANNEL;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatPromptInput {
  channel: ChatChannel;
  locale: string;
  /** blocks 3+4 of §5.5 (psyche + retrieved memories) — never cached */
  dynamicSystem?: string;
  /** block 5 — last N turns of the channel */
  history?: readonly ChatTurn[];
  /** block 6 — the user message */
  userText: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Il prefisso che la cache riconosce: dipende SOLO da lingua e canale. */
export function cachedPrefix(channel: ChatChannel, locale: string): string {
  // ADR-052: alla reception il secondo blocco sono le sue regole, non quelle di
  // casa; ADR-128: al telefono parla con un esterno, quindi le stesse
  const outward = channel === "ticket" || channel === "phone";
  const second = outward ? receptionPrompt(locale) : rulesPrompt(locale);
  return `${identityPrompt(locale)}\n\n${second}`;
}

export function chatMessages(input: ChatPromptInput): ChatMessage[] {
  const dynamic = input.dynamicSystem ?? "";
  return [
    { role: "system", content: cachedPrefix(input.channel, input.locale) },
    ...(dynamic === "" ? [] : [{ role: "system" as const, content: dynamic }]),
    ...(input.history ?? []),
    { role: "user", content: input.userText },
  ];
}

export interface ChatCompletionBody {
  model: string;
  max_tokens: number;
  messages: ChatMessage[];
  reasoning: { enabled: false };
  provider: {
    order: string[];
    only: string[];
    allow_fallbacks: true;
    zdr: true;
    data_collection: "deny";
  };
  usage: { include: true };
}

/**
 * Il corpo per `/api/v1/chat/completions`. Il ragionamento è spento: un
 * modello che pensa spende il tetto di token e risponde vuoto (misurato,
 * ADR-125). I fornitori sono un elenco chiuso e ordinato, senza conservazione.
 */
export function chatCompletionBody(
  model: string,
  providers: readonly string[],
  input: ChatPromptInput,
): ChatCompletionBody {
  return {
    model,
    max_tokens: MAX_TOKENS_BY_CHANNEL[input.channel],
    messages: chatMessages(input),
    reasoning: { enabled: false },
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
