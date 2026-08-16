import type { LocalTextClient } from "@ugo/memory";

/**
 * La finestra sul mondo (gruppo 13, ADR-063): la ricerca web con SearXNG.
 *
 * I paletti, che sono il progetto:
 *
 * - **si apre solo se gliela chiedi**: il prefisso «cerca: …» è un gesto
 *   esplicito, come «apri un ticket:» in reception (ADR-055) e il promemoria
 *   di ADR-028. UGO non naviga da solo — quella è un'altra decisione, e non
 *   è stata presa;
 * - **zero costi**: SearXNG è in casa (un container nel compose), la sintesi
 *   è del modello locale, il provider non vede passare niente;
 * - **la privacy, dichiarata dal proprietario**: le query escono verso i
 *   motori che SearXNG aggrega, ma non sono riconducibili a CHI in casa le
 *   ha fatte — e questo, per questa casa, basta. Sta scritto qui e nell'ADR,
 *   non nascosto in un default.
 */

/** «cerca: gare di go-kart» — il gesto esplicito, in una forma fissa */
export function searchQueryOf(text: string): string | undefined {
  const match = /^cerca(?:mi)?[:,]?\s+(.{2,200})$/i.exec(text.trim());
  return match?.[1]?.trim();
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearxClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const RESULTS_K = 4;

export class SearxClient {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: SearxClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** i primi risultati, o undefined quando SearXNG è giù: mai un'eccezione */
  public async search(query: string): Promise<SearchResult[] | undefined> {
    try {
      const url = new URL("/search", this.options.baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("language", "it");
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 8_000),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as {
        results?: { title?: string; url?: string; content?: string }[];
      };
      return (body.results ?? []).slice(0, RESULTS_K).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
      }));
    } catch {
      return undefined;
    }
  }
}

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export interface WebWindowDeps {
  searx: SearxClient;
  /** la sintesi, se il modello locale è su; senza si elencano i titoli */
  local?: LocalTextClient;
  localUp?: () => boolean;
}

export class WebWindow {
  public constructor(private readonly deps: WebWindowDeps) {}

  /** La risposta, o undefined quando la finestra non si apre (SearXNG giù). */
  public async ask(query: string): Promise<string | undefined> {
    const results = await this.deps.searx.search(query);
    if (results === undefined) return undefined;
    if (results.length === 0) {
      return `Ho guardato fuori, ma su «${query}» non ho trovato niente. Grunf.`;
    }

    // la sintesi locale, quando c'è: due frasi con le sue parole
    if (this.deps.local !== undefined && (this.deps.localUp?.() ?? false)) {
      const briefing = results
        .map((r) => `- ${r.title} (${host(r.url)}): ${r.snippet.slice(0, 200)}`)
        .join("\n");
      const said = await this.deps.local.generate(
        `Sei UGO, un maialino domestico curioso. Qualcuno ti ha chiesto di cercare: «${query}». ` +
          `Questi sono i risultati:\n${briefing}\n\n` +
          "Riassumi in DUE frasi in italiano, con tono da maialino, cosa hai trovato. Solo le due frasi.",
        140,
      );
      if (said !== undefined) return said;
    }

    // il ripiego deterministico: i titoli, onesti e senza modello
    const listed = results
      .slice(0, 3)
      .map((r, i) => `${String(i + 1)}) ${r.title} — ${host(r.url)}`)
      .join("; ");
    return `Ho guardato fuori per «${query}»: ${listed}. Grunf.`;
  }
}
