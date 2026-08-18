import { and, eq, sql } from "drizzle-orm";
import { budgetLedger, accounts } from "@ugo/db";
import type { DbClient } from "@ugo/db";

/**
 * La voce interim (gruppo 13): TTS emotivo via OpenAI, finché non c'è la GPU
 * per XTTS locale.
 *
 * Sta QUI, accanto a `llmClient`, per la stessa disciplina della regola 3:
 * è una chiamata a pagamento a un provider, quindi ogni frase sintetizzata
 * scrive la sua riga nel `budget_ledger` e rispetta il tetto giornaliero
 * della casa. A budget finito non solleva: risponde `undefined`, e il muso
 * degrada alla voce di sistema — la degradazione è dichiarata, non un guasto.
 *
 * L'emozione è il punto: `gpt-4o-mini-tts` accetta `instructions`, e la
 * psiche ha già la label da tradurre in quella riga. Niente SSML, niente
 * complessità: una POST, dell'audio.
 */

/**
 * Stima dichiarata, non fattura: OpenAI prezza l'audio in token (~$12/1M) e
 * il parlato italiano fa ~1 token per carattere. Meglio sovrastimare di poco
 * che scoprire a fine mese che il salvadanaio mentiva.
 */
const ESTIMATED_USD_PER_CHAR = 12e-6;

export interface TtsSpender {
  accountId: string;
  gosinoId: string;
}

export interface TtsClientOptions {
  db: DbClient;
  apiKey: string;
  /** fallback ceiling; a house that sets its own in `accounts` overrides it */
  dailyBudgetUsd: number;
  model?: string;
  voice?: string;
  baseUrl?: string;
  /** il fuso della casa (ADR-050): decide il confine del giorno del ledger */
  timezone?: string;
  timeoutMs?: number;
  /** stessa forma di `LlmClientOptions`: ID e classe dell'errore, mai il testo */
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export interface LocalTtsClient {
  /** l'audio (mp3), o undefined quando si degrada: budget finito o API giù */
  synth(text: string, instructions: string, spender: TtsSpender): Promise<Buffer | undefined>;
}

export class OpenAiTtsClient implements LocalTtsClient {
  public constructor(private readonly options: TtsClientOptions) {}

  private today(at: Date): string {
    return at.toLocaleDateString("en-CA", {
      timeZone: this.options.timezone ?? "Europe/Rome",
    });
  }

  private async budgetLeft(spender: TtsSpender, at: Date): Promise<boolean> {
    const { db } = this.options;
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(
        and(
          eq(budgetLedger.accountId, spender.accountId),
          eq(budgetLedger.date, this.today(at)),
        ),
      );
    const [house] = await db
      .select({ limit: accounts.dailyBudgetUsd })
      .from(accounts)
      .where(eq(accounts.id, spender.accountId));
    const ceiling =
      house?.limit === null || house?.limit === undefined
        ? this.options.dailyBudgetUsd
        : Number(house.limit);
    return Number(row?.total ?? 0) < ceiling;
  }

  public async synth(
    text: string,
    instructions: string,
    spender: TtsSpender,
    at: Date = new Date(),
  ): Promise<Buffer | undefined> {
    // il muro PRIMA della chiamata: a salvadanaio vuoto non si spende, e la
    // voce di sistema è il ripiego dichiarato, non un errore
    if (!(await this.budgetLeft(spender, at))) return undefined;
    let audio: Buffer;
    try {
      const response = await fetch(
        new URL("/v1/audio/speech", this.options.baseUrl ?? "https://api.openai.com"),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.options.model ?? "gpt-4o-mini-tts",
            voice: this.options.voice ?? "alloy",
            input: text,
            instructions,
            response_format: "mp3",
          }),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        },
      );
      if (!response.ok) {
        // la classe dell'errore, mai il corpo (regola 6): un 401 e un 429 si
        // curano in modi opposti, e senza questa riga erano lo stesso silenzio
        this.options.logger?.warn(
          { status: response.status, accountId: spender.accountId },
          "tts provider refused: falling back to the system voice",
        );
        return undefined;
      }
      audio = Buffer.from(await response.arrayBuffer());
    } catch {
      // irraggiungibile o scaduto: il muso parla con la voce di sistema
      return undefined;
    }

    // Fuori dal `try`, e di proposito. La scrittura sul registro stava DENTRO,
    // sotto un `catch` che restituiva `undefined`: se falliva dopo che l'audio
    // era arrivato — ed era stato pagato — si buttava via l'audio, non si
    // segnava la spesa, e non lo sapeva nessuno. Il salvadanaio perdeva una
    // riga in silenzio, che è il modo esatto in cui un tetto smette di essere
    // un tetto. Qui un guasto del registro risale, invece di sparire.
    const cost = text.length * ESTIMATED_USD_PER_CHAR;
    await this.options.db.insert(budgetLedger).values({
      date: this.today(at),
      provider: "openai",
      model: this.options.model ?? "gpt-4o-mini-tts",
      tokensIn: text.length,
      tokensOut: text.length,
      costUsd: cost.toFixed(6),
      accountId: spender.accountId,
      gosinoId: spender.gosinoId,
    });
    return audio;
  }
}
