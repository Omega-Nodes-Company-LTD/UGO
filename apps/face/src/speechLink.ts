/**
 * La fonte di quello che UGO dice (ADR-133): «ricordo che volevi andare in
 * Uganda…» arriva con il link all'articolo. Il link non si legge a voce: si
 * mostra in un'etichetta sopra la nuvoletta, e resta lì abbastanza da poterlo
 * toccare — la nuvoletta sparisce in sei secondi, un link in sei secondi no.
 */

export const LINK_SHOWN_MS = 10 * 60_000;

/** «Leggi su viaggiaresicuri.it», o niente per ciò che non è un indirizzo web. */
export function linkLabel(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return `Leggi su ${parsed.hostname.replace(/^www\./u, "")}`;
  } catch {
    return undefined;
  }
}

export class SourceChip {
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly anchor: HTMLAnchorElement) {
    // toccato una volta, ha fatto il suo lavoro
    anchor.addEventListener("click", () => {
      this.hide();
    });
  }

  public show(url: string): void {
    const label = linkLabel(url);
    if (label === undefined) return;
    this.anchor.href = url;
    this.anchor.textContent = label;
    this.anchor.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.hide();
    }, LINK_SHOWN_MS);
  }

  public hide(): void {
    clearTimeout(this.timer);
    this.anchor.hidden = true;
  }
}
