import { accounts, type DbClient } from "@ugo/db";
import {
  BLIND_VISION,
  GatedText,
  GatedVision,
  KEYLESS_REPLY,
  LlmClient,
  SILENT_TEXT,
  type ChatLlm,
  type CompletionAdapter,
  type CreditTerms,
  type GatedOptions,
  type Provider,
  type ProviderBaseUrls,
  type TextLlm,
  type VisionLlm,
  type VoiceGateOptions,
} from "@ugo/memory";
import { eq, isNull } from "drizzle-orm";
import { textAdapter } from "./adapters.js";
import { listChoices, type AiRole, type RoleChoice } from "./choices.js";
import { markKeyInvalid, secrets } from "./keyring.js";

/**
 * Con che testa pensa una casa (ADR-122): il ruolo, la fonte, la chiave.
 *
 * Le scelte e le chiavi si leggono dal database e si tengono in memoria
 * cinque minuti (o finché il pannello non le cambia: `invalidate`). Ciò che
 * il resolver consegna è **pigro**: un `ChatLlm`/`TextLlm` che guarda la
 * configurazione AL MOMENTO della chiamata — una chiave aggiunta stasera vale
 * per il runtime nato stamattina, senza riavviare niente.
 */

export interface PlatformKeys {
  anthropic?: string | undefined;
  openrouter?: string | undefined;
  openai?: string | undefined;
  elevenlabs?: string | undefined;
}

export interface AiResolverDeps {
  db: DbClient;
  dbFor: (accountId: string) => DbClient;
  masterKey: Buffer;
  dailyBudgetUsd: number;
  platform: PlatformKeys;
  baseUrls: ProviderBaseUrls;
  credit: CreditTerms;
  referer?: string | undefined;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

interface AccountAi {
  timezone: string;
  choices: Map<AiRole, RoleChoice>;
  keys: Map<Provider, string>;
}

interface Resolved {
  timezone: string;
  choice: RoleChoice;
  adapter: CompletionAdapter;
}

const TTL_MS = 5 * 60_000;

export class AiResolver {
  private readonly cache = new Map<string, { at: number; ai: AccountAi }>();
  private readonly loading = new Map<string, Promise<AccountAi>>();

  public constructor(private readonly deps: AiResolverDeps) {}

  /** Tutte le case vive, al boot: `has()` è sincrono e deve sapere già. */
  public async warm(): Promise<void> {
    const rows = await this.deps.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(isNull(accounts.closedAt));
    await Promise.all(rows.map((row) => this.load(row.id)));
  }

  public invalidate(accountId: string): void {
    this.cache.delete(accountId);
  }

  public load(accountId: string, now = Date.now()): Promise<AccountAi> {
    const hit = this.cache.get(accountId);
    if (hit !== undefined && now - hit.at < TTL_MS) return Promise.resolve(hit.ai);
    const inFlight = this.loading.get(accountId);
    if (inFlight !== undefined) return inFlight;
    const work = this.read(accountId).then((ai) => {
      this.cache.set(accountId, { at: Date.now(), ai });
      return ai;
    });
    this.loading.set(accountId, work);
    void work.finally(() => this.loading.delete(accountId)).catch(() => undefined);
    return work;
  }

  private async read(accountId: string): Promise<AccountAi> {
    const db = this.deps.dbFor(accountId);
    const [row] = await db
      .select({ timezone: accounts.timezone })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    const [choices, keys] = await Promise.all([
      listChoices(db, accountId),
      secrets(db, accountId, this.deps.masterKey),
    ]);
    return {
      timezone: row?.timezone ?? "Europe/Rome",
      choices: new Map(choices.map((c) => [c.role, c])),
      keys,
    };
  }

  /** La chiave che vale per una scelta: della casa, o di UGO a consumo. */
  private keyFor(ai: AccountAi, choice: RoleChoice): string | undefined {
    return choice.source === "ugo" ? this.deps.platform[choice.provider] : ai.keys.get(choice.provider);
  }

  /** Sincrono, dalla memoria: il ruolo è configurato e ha una chiave che vale. */
  public has(accountId: string, role: AiRole): boolean {
    const ai = this.cache.get(accountId)?.ai;
    const choice = ai?.choices.get(role);
    return ai !== undefined && choice !== undefined && this.keyFor(ai, choice) !== undefined;
  }

  /** La scelta di un ruolo con la chiave che la apre, o niente. */
  public async keyed(
    accountId: string,
    role: AiRole,
  ): Promise<{ timezone: string; choice: RoleChoice; apiKey: string } | undefined> {
    const ai = await this.load(accountId);
    const choice = ai.choices.get(role);
    if (choice === undefined) return undefined;
    const apiKey = this.keyFor(ai, choice);
    return apiKey === undefined ? undefined : { timezone: ai.timezone, choice, apiKey };
  }

  private async resolve(accountId: string, role: AiRole): Promise<Resolved | undefined> {
    const found = await this.keyed(accountId, role);
    if (found === undefined) return undefined;
    const adapter = textAdapter(found.choice, found.apiKey, this.deps.baseUrls, this.deps.referer);
    return adapter === undefined ? undefined : { timezone: found.timezone, choice: found.choice, adapter };
  }

  /** Ciò che il cancello vuole sapere di una spesa, qualunque sia il provider. */
  public gateFor(accountId: string, gosinoId: string, timezone: string, choice: RoleChoice): VoiceGateOptions {
    return {
      db: this.deps.dbFor(accountId),
      accountId,
      gosinoId,
      timezone,
      dailyBudgetUsd: this.deps.dailyBudgetUsd,
      keySource: choice.source,
      credit: this.deps.credit,
      onAuthFailure: () => {
        this.rejected(accountId, choice);
      },
      ...(this.deps.logger !== undefined && { logger: this.deps.logger }),
    };
  }

  public get baseUrls(): ProviderBaseUrls {
    return this.deps.baseUrls;
  }

  private gated(accountId: string, gosinoId: string, timezone: string, r: Resolved): GatedOptions {
    const { choice } = r;
    return {
      ...this.gateFor(accountId, gosinoId, timezone, choice),
      adapter: r.adapter,
      ...(choice.priceInPerMTok !== null &&
        choice.priceOutPerMTok !== null && {
          priceSnapshot: { inputPerMTok: choice.priceInPerMTok, outputPerMTok: choice.priceOutPerMTok },
        }),
    };
  }

  /** Il provider ha rifiutato la chiave: della casa → si segna; nostra → si grida. */
  private rejected(accountId: string, choice: RoleChoice): void {
    this.invalidate(accountId);
    if (choice.source === "ugo") {
      this.deps.logger?.warn({ provider: choice.provider }, "platform key rejected by the provider");
      return;
    }
    void markKeyInvalid(this.deps.dbFor(accountId), accountId, choice.provider).catch(() => undefined);
  }

  public chatFor(accountId: string, gosinoId: string, clock: { timezone: string; locale: string }): ChatLlm {
    return {
      chat: async (request, at) => {
        const r = await this.resolve(accountId, "chat");
        if (r === undefined) return { text: KEYLESS_REPLY, degraded: true };
        return new LlmClient({ ...this.gated(accountId, gosinoId, clock.timezone, r), locale: clock.locale }).chat(
          request,
          at,
        );
      },
    };
  }

  public textFor(accountId: string, gosinoId: string, role: "think" | "judge"): TextLlm {
    return {
      available: () => Promise.resolve(this.has(accountId, role)),
      generate: async (prompt, maxTokens, options) => {
        const r = await this.resolve(accountId, role);
        if (r === undefined) return SILENT_TEXT.generate(prompt);
        return new GatedText(this.gated(accountId, gosinoId, r.timezone, r)).generate(
          prompt,
          maxTokens,
          options,
        );
      },
    };
  }

  public visionFor(accountId: string, gosinoId: string): VisionLlm {
    return {
      available: () => Promise.resolve(this.has(accountId, "vision")),
      describe: async (image) => {
        const r = await this.resolve(accountId, "vision");
        if (r === undefined) return BLIND_VISION.describe(image);
        return new GatedVision(this.gated(accountId, gosinoId, r.timezone, r)).describe(image);
      },
    };
  }
}
