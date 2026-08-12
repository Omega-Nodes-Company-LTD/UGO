import { Transcript, clockOf, type Line } from "./transcript.js";

/**
 * The scroll, on screen (ADR-038).
 *
 * `Transcript` is the storage and the cap; this is the panel over it — drawing,
 * opening, shutting, and the three buttons. It lives apart from `main.ts`
 * because the wiring file is already long past the 200-line rule (CLAUDE.md
 * rule 10) and this is a whole feature with its own state.
 */

export interface LogPanel {
  /** Record a line, redrawing only if anyone is looking. */
  remember: (line: Line) => void;
}

export interface LogPanelElements {
  /** carries `data-log`, which hides the bubble the panel would sit on top of */
  app: HTMLElement;
  panel: HTMLElement;
  lines: HTMLElement;
  toggle: HTMLElement;
  close: HTMLElement;
  clear: HTMLElement;
}

export function mountLogPanel(elements: LogPanelElements, room: string | null): LogPanel {
  // keyed by room: the kitchen dock and the study dock are two conversations,
  // and merging them would help nobody
  const transcript = new Transcript(`ugo_log_${room ?? "casa"}`);

  const draw = (): void => {
    const lines = transcript.all();
    elements.lines.innerHTML =
      lines.length === 0
        ? '<li class="empty">Ancora niente. Quello che viene detto finisce qui.</li>'
        : lines.map(asItem).join("");
    elements.lines.scrollTop = elements.lines.scrollHeight;
  };

  /** Open or shut in one place: the scroll and the bubble cover each other. */
  const show = (open: boolean): void => {
    elements.panel.hidden = !open;
    elements.app.dataset.log = open ? "on" : "off";
    if (open) draw();
  };

  elements.toggle.addEventListener("click", () => {
    show(elements.panel.hidden);
  });
  elements.close.addEventListener("click", () => {
    show(false);
  });
  elements.clear.addEventListener("click", () => {
    transcript.clear();
    draw();
  });

  return {
    remember: (line) => {
      transcript.add(line);
      if (!elements.panel.hidden) draw();
    },
  };
}

const asItem = (line: Line): string =>
  `<li class="${line.mine ? "mine" : ""}"><span class="when">${clockOf(line.at)}</span>` +
  `<span class="who">${escapeHtml(line.who)}:</span> ${escapeHtml(line.text)}</li>`;

/** The scroll holds words: they go in as text, never as markup. */
function escapeHtml(value: string): string {
  const box = document.createElement("div");
  box.textContent = value;
  return box.innerHTML;
}
