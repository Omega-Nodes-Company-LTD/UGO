import { z } from "zod";
import { anthropicModel, anthropicModelIds } from "../pricing.js";
import type { TextProvider } from "./types.js";

/**
 * La lista da cui la casa sceglie (ADR-122): viene dal provider, non da noi.
 *
 * - OpenRouter: `GET /api/v1/models` è pubblico e porta i prezzi. Una copia
 *   per processo, rinfrescata ogni sei ore.
 * - Anthropic: `GET /v1/models` con la chiave della casa (dice quali modelli
 *   QUELLA chiave vede), incrociato col nostro listino: un modello che non
 *   sappiamo prezzare non si offre, o il ledger lo incontrerebbe senza prezzo.
 */

export type TextRole = "chat" | "think" | "vision" | "judge";

export interface CatalogModel {
  provider: TextProvider;
  id: string;
  label: string;
  /** USD per milione di token, quando il provider lo dice */
  inputPerMTok?: number;
  outputPerMTok?: number;
  vision: boolean;
  contextLength?: number;
}

const openRouterSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().nullish(),
      pricing: z
        .object({ prompt: z.string().optional(), completion: z.string().optional() })
        .optional(),
      architecture: z
        .object({
          input_modalities: z.array(z.string()).optional(),
          output_modalities: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  ),
});

const anthropicSchema = z.object({
  data: z.array(z.object({ id: z.string(), display_name: z.string().optional() })),
});

const OPENROUTER_TTL_MS = 6 * 3_600_000;
const ANTHROPIC_TTL_MS = 3_600_000;

export interface CatalogOptions {
  openRouterBaseUrl?: string;
  anthropicBaseUrl?: string;
  timeoutMs?: number;
}

const perMTok = (perToken: string | undefined): number | undefined => {
  if (perToken === undefined) return undefined;
  const value = Number(perToken);
  return Number.isFinite(value) && value >= 0 ? value * 1e6 : undefined;
};

/** Il ruolo chiede una capacità: la visione vuole immagini in ingresso. */
export function fitsRole(model: CatalogModel, role: TextRole): boolean {
  return role === "vision" ? model.vision : true;
}

export class ModelCatalog {
  private openRouterCache: { at: number; models: CatalogModel[] } | undefined;
  private readonly anthropicCache = new Map<string, { at: number; models: CatalogModel[] }>();

  public constructor(private readonly options: CatalogOptions = {}) {}

  public async openRouter(now = Date.now()): Promise<CatalogModel[]> {
    const cached = this.openRouterCache;
    if (cached !== undefined && now - cached.at < OPENROUTER_TTL_MS) return cached.models;
    const response = await fetch(
      new URL("/api/v1/models", this.options.openRouterBaseUrl ?? "https://openrouter.ai"),
      { signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000) },
    );
    if (!response.ok) throw new Error(`openrouter catalog (status ${String(response.status)})`);
    const parsed = openRouterSchema.parse(await response.json());
    const models = parsed.data
      .filter((m) => m.architecture?.output_modalities?.includes("text") ?? true)
      .map((m) => {
        const input = perMTok(m.pricing?.prompt);
        const output = perMTok(m.pricing?.completion);
        return {
          provider: "openrouter" as const,
          id: m.id,
          label: m.name ?? m.id,
          ...(input !== undefined && { inputPerMTok: input }),
          ...(output !== undefined && { outputPerMTok: output }),
          vision: m.architecture?.input_modalities?.includes("image") ?? false,
          ...(m.context_length !== undefined && m.context_length !== null && {
            contextLength: m.context_length,
          }),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    this.openRouterCache = { at: now, models };
    return models;
  }

  /** `cacheKey` identifica la chiave senza tenerla in chiaro come chiave di mappa. */
  public async anthropic(apiKey: string, cacheKey: string, now = Date.now()): Promise<CatalogModel[]> {
    const cached = this.anthropicCache.get(cacheKey);
    if (cached !== undefined && now - cached.at < ANTHROPIC_TTL_MS) return cached.models;
    const response = await fetch(
      new URL("/v1/models?limit=100", this.options.anthropicBaseUrl ?? "https://api.anthropic.com"),
      {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
      },
    );
    if (!response.ok) throw new Error(`anthropic catalog (status ${String(response.status)})`);
    const visible = new Set(anthropicSchema.parse(await response.json()).data.map((m) => m.id));
    const models = anthropicModelIds()
      .filter((id) => visible.has(id))
      .map((id) => {
        const known = anthropicModel(id);
        return {
          provider: "anthropic" as const,
          id,
          label: known?.label ?? id,
          ...(known !== undefined && {
            inputPerMTok: known.inputPerMTok,
            outputPerMTok: known.outputPerMTok,
          }),
          vision: known?.vision ?? false,
        };
      });
    this.anthropicCache.set(cacheKey, { at: now, models });
    return models;
  }

  /** Dopo un cambio di chiave la lista vecchia non vale più. */
  public forget(cacheKey: string): void {
    this.anthropicCache.delete(cacheKey);
  }
}
