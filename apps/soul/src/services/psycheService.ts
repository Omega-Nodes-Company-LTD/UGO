import { psycheSnapshots, type DbClient } from "@ugo/db";
import {
  applyPerturbations,
  emptyState,
  labelPhrase,
  perturbationsForEvent,
  pickLabel,
  stateFromSnapshot,
  varsAt,
  type PsycheState,
  type PsycheVars,
} from "@ugo/psyche";
import { desc } from "drizzle-orm";
import { z } from "zod";

const varsSchema = z.object({
  energia: z.number(),
  umore: z.number(),
  affetto: z.number(),
  noia: z.number(),
  stress: z.number(),
  curiosita: z.number(),
});

export interface PsycheView {
  vars: PsycheVars;
  label: string;
  phrase: string;
}

/**
 * Holds the live homeostasis state and persists snapshots (PROGETTO §5.3):
 * one on every label transition, plus the periodic one driven by index.ts.
 */
export class PsycheService {
  private state: PsycheState;

  public constructor(
    private readonly db: DbClient,
    initialState?: PsycheState,
  ) {
    this.state = initialState ?? emptyState();
  }

  /** Rebuild the state from the latest snapshot (soul restart). */
  public static async restore(db: DbClient, at: Date = new Date()): Promise<PsycheService> {
    const rows = await db
      .select({ vars: psycheSnapshots.vars })
      .from(psycheSnapshots)
      .orderBy(desc(psycheSnapshots.ts))
      .limit(1);
    const raw = rows[0]?.vars;
    if (raw === undefined) return new PsycheService(db);
    const parsed = varsSchema.safeParse(raw);
    if (!parsed.success) return new PsycheService(db);
    return new PsycheService(db, stateFromSnapshot(parsed.data, at));
  }

  public current(at: Date = new Date()): PsycheView {
    const vars = varsAt(this.state, at);
    const label = pickLabel(vars, this.state.lastEventType);
    return { vars, label, phrase: labelPhrase(label) };
  }

  /** Apply an event's perturbations; snapshot when the label transitions. */
  public async applyEventType(eventType: string, at: Date = new Date()): Promise<PsycheView> {
    const before = this.current(at).label;
    const perturbations = perturbationsForEvent(eventType);
    if (perturbations.length > 0) {
      this.state = applyPerturbations(this.state, perturbations, at, eventType);
    }
    const view = this.current(at);
    if (view.label !== before) {
      await this.snapshot(at);
    }
    return view;
  }

  public async snapshot(at: Date = new Date()): Promise<void> {
    const { vars, label } = this.current(at);
    await this.db.insert(psycheSnapshots).values({ ts: at, vars, label });
  }
}
