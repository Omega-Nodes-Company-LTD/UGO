import type { Act } from "@ugo/shared";

/**
 * Il ponte verso il libro genealogico (ADR-073).
 *
 * Regola sola e non negoziabile: **una nascita non fallisce mai per il
 * registro**. Se il registrar è giù, il gosino nasce lo stesso e l'atto resta
 * da pubblicare — una creatura non è ostaggio della propria burocrazia.
 *
 * Timeout corto per lo stesso motivo del `post()` della percezione: una
 * promessa appesa su un container piantato è un guasto che si vede fra
 * settimane, in heap.
 */

export type PublishOutcome =
  | { published: true; seq: number; alreadyRegistered: boolean }
  | { published: false; reason: string };

export interface RegistryClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

export class RegistryClient {
  public constructor(private readonly options: RegistryClientOptions) {}

  public async publish(act: Act): Promise<PublishOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs ?? 4000);
    try {
      const response = await fetch(new URL("/acts", this.options.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(act),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { published: false, reason: `il registro ha risposto ${String(response.status)}` };
      }
      const body = (await response.json()) as {
        entry?: { seq: number };
        alreadyRegistered?: boolean;
      };
      return {
        published: true,
        seq: body.entry?.seq ?? 0,
        alreadyRegistered: body.alreadyRegistered === true,
      };
    } catch (error) {
      return {
        published: false,
        reason: error instanceof Error ? error.message : "il registro non risponde",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cosa dice il registro di questa creatura. Lettura pubblica: niente token. */
  public async actsFor(gosinoId: string): Promise<{ seq: number; kind: string; at: string }[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs ?? 4000);
    try {
      const response = await fetch(
        new URL(`/acts/${encodeURIComponent(gosinoId)}`, this.options.baseUrl),
        { signal: controller.signal },
      );
      if (!response.ok) return [];
      const body = (await response.json()) as {
        entries?: { seq: number; act: { kind: string; at: string } }[];
      };
      return (body.entries ?? []).map((entry) => ({
        seq: entry.seq,
        kind: entry.act.kind,
        at: entry.act.at,
      }));
    } catch {
      // il registro giù non deve rendere illeggibile un pedigree: le firme
      // dei genitori valgono comunque, ed è la parte che conta di più
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
