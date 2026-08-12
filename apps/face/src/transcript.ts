/**
 * What was said, kept (ADR-038).
 *
 * The bubble shows a line for six seconds and then it is gone. Miss it — you
 * were in the other room, the phone was in a pocket — and the sentence is
 * unrecoverable from the body: the soul has it, but that means opening the
 * panel on another device to read your own conversation.
 *
 * So the body keeps a scroll of its own. Persisted, because a page that
 * reloads and loses the thing you were trying to catch is the same failure
 * again; capped, because this is conversation text sitting in clear on a
 * device (CLAUDE.md rule 6 is about the server's storage, and this is a new
 * place the same words live) — a short tail is worth it, an archive is not.
 * Emptying it is one button, and it is the only copy the body holds.
 */

export interface Line {
  /** who said it: a creature's name, or "tu" for what the room was heard to say */
  who: string;
  text: string;
  /** epoch ms, so the list survives a reload with its clock intact */
  at: number;
  mine: boolean;
}

/** Enough to find what you missed this afternoon, not enough to be an archive. */
const KEEP = 80;

/** The slice of `localStorage` this needs, so a test can hand it another one. */
export interface Store {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export class Transcript {
  private lines: Line[] = [];

  public constructor(
    private readonly key: string,
    private readonly store: Store = localStorage,
  ) {
    try {
      const raw = this.store.getItem(this.key);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      if (Array.isArray(parsed)) this.lines = parsed.filter(isLine).slice(-KEEP);
    } catch {
      // corrupt or unavailable storage is not worth a broken body
      this.lines = [];
    }
  }

  public all(): readonly Line[] {
    return this.lines;
  }

  public add(line: Line): void {
    this.lines = [...this.lines, line].slice(-KEEP);
    this.save();
  }

  public clear(): void {
    this.lines = [];
    this.save();
  }

  private save(): void {
    try {
      this.store.setItem(this.key, JSON.stringify(this.lines));
    } catch {
      // a full or disabled storage costs the history, never the conversation
    }
  }
}

function isLine(value: unknown): value is Line {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<Line>;
  return (
    typeof line.who === "string" && typeof line.text === "string" && typeof line.at === "number"
  );
}

/** "14:32" — the time is what you scan for when hunting a lost sentence. */
export function clockOf(at: number): string {
  return new Date(at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
