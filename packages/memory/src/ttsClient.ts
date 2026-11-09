import { and, eq, sql } from "drizzle-orm";
import { budgetLedger, accounts } from "@ugo/db";
import type { DbClient } from "@ugo/db";
import { z } from "zod";
import { OPENROUTER_URL } from "./chatRequest.js";
import { taggedText } from "./voiceTags.js";

/**
 * La voce: ElevenLabs, sempre tramite OpenRouter (ADR-125 §6).
 *
 * Sta QUI, accanto a `llmClient`, per la stessa disciplina della regola 3: è
 * una chiamata a pagamento, quindi ogni frase sintetizzata scrive la sua riga
 * nel `budget_ledger` e rispetta il tetto giornaliero della casa. A budget
 * finito non solleva: risponde `undefined`, e il muso scende alla voce di casa
 * (Piper) o di sistema — la degradazione è dichiarata, non un guasto.
 *
 * La voce (`voice`) è del gosino, non del processo: viene dal suo genoma
 * (ADR-126). L'umore la colora con un tag audio (`voiceTags.ts`).
 */

export const DEFAULT_TTS_MODEL = "elevenlabs/eleven-v4";

/**
 * Il listino della voce ElevenLabs su OpenRouter è per CARATTERE (80 $ al
 * milione per `eleven-v4`, 2026-11-09). Si legge vivo dal catalogo; questo è
 * il ripiego dichiarato se il catalogo non risponde — il prezzo più alto fra
 * i modelli ElevenLabs, perché un salvadanaio che sovrastima di poco è meglio
 * di uno che mente.
 */
export const FALLBACK_USD_PER_CHAR = 80e-6;

const catalogSchema = z.object({
  data: z.array(z.object({ id: z.string(), pricing: z.object({ prompt: z.string() }) })),
});

export interface TtsSpender {
  accountId: string;
  gosinoId: string;
}

export interface TtsRequest {
  text: string;
  /** l'etichetta della psiche (`pickLabel`): diventa un tag audio */
  mood?: string;
  /** la voce del gosino, dal suo genoma (ADR-126) */
  voice: string;
}

export interface TtsClientOptions {
  db: DbClient;
  /** ADR-098: la connessione della casa che spende; assente = `db` */
  dbFor?: (accountId: string) => DbClient;
  apiKey: string;
  /** fallback ceiling; a house that sets its own in `accounts` overrides it */
  dailyBudgetUsd: number;
  model?: string;
  /** il fuso della casa (ADR-050): decide il confine del giorno del ledger */
  timezone?: string;
  timeoutMs?: number;
  /** stessa forma di `LlmClientOptions`: ID e classe dell'errore, mai il testo */
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export interface LocalTtsClient {
  /** l'audio (mp3), o undefined quando si degrada: budget finito o API giù */
  synth(request: TtsRequest, spender: TtsSpender): Promise<Buffer | undefined>;
}

export class OpenRouterTtsClient implements LocalTtsClient {
  private readonly model: string;
  /** il listino si legge una volta per processo: la voce non cambia prezzo ogni frase */
  private price: Promise<number> | undefined;

  public constructor(private readonly options: TtsClientOptions) {
    this.model = options.model ?? DEFAULT_TTS_MODEL;
  }

  private today(at: Date): string {
    return at.toLocaleDateString("en-CA", { timeZone: this.options.timezone ?? "Europe/Rome" });
  }

  /** ADR-098: la connessione della casa che spende; assente = `db` */
  private dbOf(accountId: string): DbClient {
    return this.options.dbFor?.(accountId) ?? this.options.db;
  }

  private async budgetLeft(spender: TtsSpender, at: Date): Promise<boolean> {
    const db = this.dbOf(spender.accountId);
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${budgetLedger.costUsd}), 0)` })
      .from(budgetLedger)
      .where(
        and(eq(budgetLedger.accountId, spender.accountId), eq(budgetLedger.date, this.today(at))),
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

  /** Il prezzo per carattere del modello, dal catalogo vivo di OpenRouter. */
  public usdPerChar(): Promise<number> {
    this.price ??= this.readPrice();
    return this.price;
  }

  private async readPrice(): Promise<number> {
    try {
      const response = await fetch(
        new URL("/api/v1/models?output_modalities=speech", OPENROUTER_URL),
        { signal: AbortSignal.timeout(10_000) },
      );
      const catalog = catalogSchema.parse(await response.json());
      const price = Number(catalog.data.find((model) => model.id === this.model)?.pricing.prompt);
      if (Number.isFinite(price) && price > 0) return price;
    } catch {
      // sotto: il ripiego dichiarato
    }
    this.price = undefined; // si riprova alla prossima frase
    this.options.logger?.warn({ model: this.model }, "tts price unreadable: using the declared fallback");
    return FALLBACK_USD_PER_CHAR;
  }

  public async synth(
    request: TtsRequest,
    spender: TtsSpender,
    at: Date = new Date(),
  ): Promise<Buffer | undefined> {
    // il muro PRIMA della chiamata: a salvadanaio vuoto non si spende
    if (!(await this.budgetLeft(spender, at))) return undefined;
    const input = taggedText(request.text, request.mood);
    let audio: Buffer;
    try {
      const response = await fetch(new URL("/api/v1/audio/speech", OPENROUTER_URL), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: this.model, voice: request.voice, input, response_format: "mp3" }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      });
      if (!response.ok) {
        // la classe dell'errore, mai il corpo (regola 6): un 401 e un 429 si
        // curano in modi opposti, e senza questa riga erano lo stesso silenzio
        this.options.logger?.warn(
          { status: response.status, accountId: spender.accountId },
          "tts provider refused: falling back to the home voice",
        );
        return undefined;
      }
      audio = Buffer.from(await response.arrayBuffer());
    } catch {
      // irraggiungibile o scaduto: il muso scende alla voce di casa
      return undefined;
    }

    // Fuori dal `try`, e di proposito: l'audio è arrivato, quindi è stato
    // pagato, e un guasto del registro deve risalire invece di sparire.
    const cost = input.length * (await this.usdPerChar());
    await this.dbOf(spender.accountId).insert(budgetLedger).values({
      date: this.today(at),
      provider: "openrouter",
      model: this.model,
      tokensIn: input.length,
      tokensOut: 0,
      costUsd: cost.toFixed(6),
      accountId: spender.accountId,
      gosinoId: spender.gosinoId,
    });
    return audio;
  }
}
