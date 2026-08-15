import { bonds, events, type DbClient } from "@ugo/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { EfficacyService } from "./efficacy.js";

/**
 * La mela: cosa succede oltre all'essere contento (ADR-058).
 *
 * Due cose, e sono deliberatamente separate perché sono di due sistemi diversi:
 *
 * - **scalda il legame** con chi gliel'ha data (`bonds.affinity`);
 * - **pesa l'atto** che se l'è meritata (`act_efficacy`).
 *
 * La prima è la **prima scrittura in assoluto** su `bonds.affinity`. Quella
 * colonna ha un check, un indice, una resa nel prompt (`packPrompt.ts`,
 * «ti sta simpatico») e una barra nel pannello — e non l'aveva mai scritta
 * nessuno. Era una faccia dipinta su una porta murata.
 */

/**
 * Quanto scalda una mela, e dove si ferma.
 *
 * Piccolo, e con un tetto molto sotto l'1 del check: il legame lo si guadagna
 * col tempo (ADR-014), e un premio che porta l'affinità a 1 in cinquanta clic
 * renderebbe la colonna un contatore di clic invece di un rapporto.
 */
const AFFINITY_STEP = 0.02;
const AFFINITY_CEILING = 0.6;

/**
 * Quanto spesso una mela può scaldare la stessa persona.
 *
 * Il raffreddamento è sull'**affinità**, non sull'umore: quello ha già il suo
 * `ceiling` nella psiche. Senza, il legame si coltiverebbe tenendo premuto.
 */
const AFFINITY_COOLDOWN_MIN = 30;

/** Entro quanto un'iniziativa è ancora «quella che stai premiando». */
const RECENT_ACT_MIN = 10;

export interface RewardDeps {
  db: DbClient;
  gosinoId: string;
  householdId: string;
  efficacy: EfficacyService;
  /**
   * Chi c'è nella stanza adesso, se lo si sa. **Nessuna persona identificata,
   * nessuna scrittura**: la tentazione da rifiutare è `eldestExemplarOf` o «il
   * primo del branco», che è il difetto già noto di `POST /v1/corrections`
   * (`social.ts`). Ripeterlo qui farebbe accumulare affinità in silenzio alla
   * persona sbagliata, ed è un errore che nessuno può scoprire guardando.
   */
  whoIsHere?: () => Promise<string | undefined>;
}

export class RewardService {
  public constructor(private readonly deps: RewardDeps) {}

  public async give(input: { act?: string | undefined; at: Date }): Promise<void> {
    await Promise.all([this.warmBond(input.at), this.weighAct(input.act, input.at)]);
  }

  /** Il legame con chi gliel'ha data — e solo se si sa chi è. */
  private async warmBond(at: Date): Promise<void> {
    const beingId = await this.deps.whoIsHere?.();
    if (beingId === undefined) return;

    const [bond] = await this.deps.db
      .select({ affinity: bonds.affinity, updatedAt: bonds.updatedAt })
      .from(bonds)
      .where(and(eq(bonds.gosinoId, this.deps.gosinoId), eq(bonds.beingId, beingId)));
    if (bond === undefined) return;
    const sinceMin = (at.getTime() - bond.updatedAt.getTime()) / 60_000;
    if (sinceMin < AFFINITY_COOLDOWN_MIN) return;
    if (bond.affinity >= AFFINITY_CEILING) return;

    await this.deps.db
      .update(bonds)
      .set({
        affinity: sql`least(${AFFINITY_CEILING}, ${bonds.affinity} + ${AFFINITY_STEP})`,
        updatedAt: at,
      })
      .where(and(eq(bonds.gosinoId, this.deps.gosinoId), eq(bonds.beingId, beingId)));
  }

  /**
   * L'atto che se l'è meritata.
   *
   * Se il corpo non ha detto quale, lo si cerca fra le iniziative degli ultimi
   * dieci minuti: premiare mezz'ora dopo qualcosa di cui non ci si ricorda
   * peserebbe un atto a caso, che è peggio che non pesarne nessuno.
   */
  private async weighAct(named: string | undefined, at: Date): Promise<void> {
    const act = named ?? (await this.lastInitiative(at));
    if (act === undefined) return;
    await this.deps.efficacy.nudge(act, "praise");
  }

  private async lastInitiative(at: Date): Promise<string | undefined> {
    const since = new Date(at.getTime() - RECENT_ACT_MIN * 60_000);
    const [row] = await this.deps.db
      .select({ payload: events.payload })
      .from(events)
      .where(
        and(
          eq(events.gosinoId, this.deps.gosinoId),
          eq(events.type, "initiative_taken"),
          gte(events.ts, since),
        ),
      )
      .orderBy(desc(events.ts))
      .limit(1);
    const act = (row?.payload as { act?: unknown } | undefined)?.act;
    return typeof act === "string" ? act : undefined;
  }
}
