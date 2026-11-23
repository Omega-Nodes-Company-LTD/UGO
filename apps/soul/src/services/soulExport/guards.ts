/**
 * The small pure rules around the export route (ADR-132, MKT-10.4).
 *
 * An export hands out the most complete copy of a creature there will ever be,
 * so it is deliberately a little hard to ask for: the person types the
 * creature's name (the same pact as the farewell, ADR-075), and a house can
 * start only a few an hour — each holds a database snapshot open while it
 * streams, and a loop of them is either a bug or someone trying to wear the
 * server out.
 */

/** Same contract as the kiosk's `nameMatches` (ADR-090): forgiving of case and spaces only. */
export function nameMatches(typed: string, chosen: string): boolean {
  const clean = (value: string): string => value.trim().toLowerCase().replace(/\s+/gu, " ");
  return clean(typed) !== "" && clean(typed) === clean(chosen);
}

/**
 * `ugo-2026-11-23.ugosoul`. The name of a creature is user text and ends up in
 * a `content-disposition` header, so it is reduced to `[a-z0-9-]` — no path,
 * no quote, no line break can survive the trip.
 */
export function archiveFileName(creatureName: string, on: Date): string {
  const slug = creatureName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40)
    .replace(/-+$/u, "");
  return `${slug === "" ? "gosino" : slug}-${on.toISOString().slice(0, 10)}.ugosoul`;
}

export type LimitVerdict = "ok" | "busy" | "rate";

export interface LimiterOptions {
  perWindow: number;
  windowMs: number;
  now?: () => number;
}

/** In memory, per process: a restart forgets, which only ever errs towards allowing one more. */
export class ExportLimiter {
  private readonly starts = new Map<string, number[]>();
  private readonly running = new Set<string>();
  private readonly now: () => number;

  public constructor(private readonly options: LimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  private recent(house: string): number[] {
    const cutoff = this.now() - this.options.windowMs;
    const kept = (this.starts.get(house) ?? []).filter((at) => at > cutoff);
    this.starts.set(house, kept);
    return kept;
  }

  public tryStart(house: string): LimitVerdict {
    if (this.running.has(house)) return "busy";
    const recent = this.recent(house);
    if (recent.length >= this.options.perWindow) return "rate";
    recent.push(this.now());
    this.running.add(house);
    return "ok";
  }

  public finish(house: string): void {
    this.running.delete(house);
  }

  public retryAfterSeconds(house: string): number {
    const oldest = this.recent(house)[0];
    if (oldest === undefined) return 0;
    return Math.max(1, Math.ceil((oldest + this.options.windowMs - this.now()) / 1000));
  }
}
