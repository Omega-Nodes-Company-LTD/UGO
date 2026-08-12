import { psycheBaselines, psycheSnapshots, type DbClient } from "@ugo/db";
import {
  applyPerturbations,
  breakdownAt,
  emptyState,
  labelPhrase,
  perturbationsForEvent,
  lastBlowAt,
  pickLabel,
  STARTLE_WINDOW_MS,
  stateFromSnapshot,
  varsAt,
  type BaselineOverrides,
  type PsycheState,
  type PsycheVariable,
  type PsycheVars,
  type VariableBreakdown,
} from "@ugo/psyche";
import { desc, eq } from "drizzle-orm";
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
    private readonly overrides: BaselineOverrides = {},
    /**
     * ADR-032: whose mood this is. Undefined means the seeded exemplar, which
     * is what a single-exemplar house has always been — the column default.
     */
    private readonly gosinoId?: string,
  ) {
    this.state = initialState ?? emptyState();
  }

  /** Rebuild state + adaptive baselines (ADR-012) from the database. */
  public static async restore(
    db: DbClient,
    at: Date = new Date(),
    gosinoId?: string,
  ): Promise<PsycheService> {
    const mine = gosinoId === undefined ? undefined : eq(psycheBaselines.gosinoId, gosinoId);
    const baselineRows = await db
      .select({ variable: psycheBaselines.variable, baseline: psycheBaselines.baseline })
      .from(psycheBaselines)
      .where(mine);
    const overrides: BaselineOverrides = {};
    for (const row of baselineRows) {
      if (["umore", "affetto", "noia", "stress", "curiosita"].includes(row.variable)) {
        overrides[row.variable as keyof BaselineOverrides] = row.baseline;
      }
    }
    const rows = await db
      .select({ vars: psycheSnapshots.vars })
      .from(psycheSnapshots)
      .where(gosinoId === undefined ? undefined : eq(psycheSnapshots.gosinoId, gosinoId))
      .orderBy(desc(psycheSnapshots.ts))
      .limit(1);
    const parsed = varsSchema.safeParse(rows[0]?.vars);
    if (!parsed.success) return new PsycheService(db, undefined, overrides, gosinoId);
    return new PsycheService(
      db,
      stateFromSnapshot(parsed.data, at, undefined, overrides),
      overrides,
      gosinoId,
    );
  }

  public current(at: Date = new Date()): PsycheView {
    const vars = varsAt(this.state, at, undefined, this.overrides);
    // ADR-040: what the LAST blow was worth, so a habituated creature stops
    // being described as a frightened one
    const blow = lastBlowAt(this.state, at, STARTLE_WINDOW_MS);
    const label = pickLabel(vars, this.state.lastEventType, blow);
    return { vars, label, phrase: labelPhrase(label) };
  }

  /**
   * Why each variable reads what it reads (ADR-034). The adaptive baselines go
   * in too, so «riposa a 0,42» is his own resting point and not the species
   * constant — otherwise the arithmetic on screen would not add up.
   */
  public breakdown(at: Date = new Date()): Record<PsycheVariable, VariableBreakdown> {
    return breakdownAt(this.state, at, undefined, this.overrides);
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
    await this.db.insert(psycheSnapshots).values({
      ts: at,
      vars,
      label,
      ...(this.gosinoId !== undefined && { gosinoId: this.gosinoId }),
    });
  }
}
