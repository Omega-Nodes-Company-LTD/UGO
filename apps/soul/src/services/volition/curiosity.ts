import { desires, memories, type DbClient } from "@ugo/db";
import type { LocalTextClient } from "@ugo/memory";
import { decryptText } from "@ugo/shared";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * Where a question comes from (ADR-027).
 *
 * UGO has never once asked anything he was not asked first. This is the piece
 * that lets him form one: it reads back a handful of things he actually knows,
 * and asks the LOCAL model for the one thing he would genuinely want to know
 * next.
 *
 * Local on purpose, and not negotiable: an initiative that could reach the paid
 * provider is an initiative that can drain the day's budget while nobody is
 * looking. Here the worst case is a wasted second of CPU on our own server.
 *
 * The question is stored as a `desire` — the table the dream already writes to
 * — so it survives a restart, comes out when the moment is right, and is
 * marked done once said. A curiosity that evaporates on reboot is not a want.
 */

const HOW_MANY_MEMORIES = 8;
/** A question longer than this is a paragraph, and he is a pig, not a lawyer. */
const MAX_CHARS = 180;

export interface CuriosityDeps {
  db: DbClient;
  local: LocalTextClient;
  dataKey: Buffer;
  /** the exemplar asking; his own name goes in the prompt */
  name: string;
  /** one line of character, from the genome (ADR-028) */
  persona?: string;
  /** ADR-032: whose memories he reads back, and whose desire he files */
  gosinoId: string;
}

function buildPrompt(name: string, persona: string | undefined, facts: readonly string[]): string {
  return [
    `Sei ${name}, un maialino che vive in casa con il suo proprietario.`,
    persona ?? "",
    "",
    "Queste sono alcune cose che sai:",
    ...facts.map((fact) => `- ${fact}`),
    "",
    "Scrivi UNA sola domanda breve, in italiano, che ti verrebbe voglia di fare",
    "al tuo proprietario partendo da quello che sai. Deve essere curiosa e",
    "concreta, non generica, e non deve ripetere una cosa che già sai.",
    "Rispondi soltanto con la domanda, senza virgolette e senza spiegazioni.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Strips the model's habitual scaffolding down to a single question.
 *
 * It scans for the first line that *is* a question rather than taking the
 * first line outright: a small local model prefaces almost every answer
 * ("Ecco la domanda:"), and throwing the whole reply away over a courtesy
 * line would make curiosity fail most of the time.
 */
export function tidyQuestion(raw: string): string | undefined {
  for (const line of raw.split("\n")) {
    const cleaned = line
      .trim()
      .replace(/^["'«»\-*\d.)\s]+/u, "")
      .replace(/["'«»]+$/u, "")
      .trim();
    if (cleaned.length < 8 || cleaned.length > MAX_CHARS) continue;
    // it has to actually be a question; a statement is not curiosity
    if (cleaned.endsWith("?")) return cleaned;
  }
  return undefined;
}

export class Curiosity {
  public constructor(private readonly deps: CuriosityDeps) {}

  /** Reads back what he knows. Decrypted here, never logged. */
  private async recentFacts(): Promise<string[]> {
    const rows = await this.deps.db
      .select({ text: memories.text })
      .from(memories)
      .where(
        and(
          isNull(memories.invalidatedAt),
          eq(memories.gosinoId, this.deps.gosinoId),
        ),
      )
      .orderBy(desc(memories.createdAt))
      .limit(HOW_MANY_MEMORIES);
    return rows.map((row) => decryptText(row.text, this.deps.dataKey));
  }

  /**
   * Forms a question and files it as a pending desire.
   * Returns the question, or undefined when the model had nothing usable —
   * in which case initiative simply falls back to the acts that need no words.
   */
  public async wonder(): Promise<string | undefined> {
    const facts = await this.recentFacts();
    if (facts.length === 0) return undefined;
    const raw = await this.deps.local.generate(
      buildPrompt(this.deps.name, this.deps.persona, facts),
      80,
    );
    if (raw === undefined) return undefined;
    const question = tidyQuestion(raw);
    if (question === undefined) return undefined;
    await this.deps.db.insert(desires).values({
      text: question,
      status: "pending",
      gosinoId: this.deps.gosinoId,
    });
    return question;
  }
}
