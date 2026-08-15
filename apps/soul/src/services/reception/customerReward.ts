import {
  customerGosini,
  customerMessages,
  customerRewards,
  customers,
  events,
  type DbClient,
} from "@ugo/db";
import type { ReceptionRewardAllowance } from "@ugo/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import { GosinoNotAssignedError } from "./customerChatService.js";

/**
 * La mela del cliente (ADR-058, il muro del cliente).
 *
 * È la stessa mela del muso — deliberata, rara, e per questo significa
 * qualcosa — ma con un muro che quella di casa non ha: **quante**. Il
 * proprietario l'ha deciso a voce: «gliele danno solo se davvero fa bene
 * l'assistente, ne avranno tipo 2 a settimana». Un premio illimitato in mano a
 * un cliente non è un premio, è un bottone di cortesia — e un segnale che
 * arriva sempre è un segnale che non dice più niente.
 *
 * Cosa fa e cosa NON fa, ed entrambe le metà sono la decisione:
 *
 * - **fa**: perturba la psiche col medesimo evento `reward` di ADR-058 (coi
 *   suoi tetti anti-farming), e lascia una riga nella memoria episodica — il
 *   sogno la vede, e il pannello può dire quali risposte hanno meritato una
 *   mela;
 * - **non fa**: niente `bonds.affinity` (il legame è del branco: un cliente
 *   non è un `being`, e inventargli una riga sarebbe il difetto di
 *   `eldestExemplarOf` sotto altro nome) e niente `act_efficacy` (i pesi sono
 *   sulle **iniziative** del corpo; qui si premia una risposta di chat, e
 *   pesare un atto a caso è peggio che non pesarne nessuno).
 *
 * Il conteggio è **sempre di Postgres**, su finestra mobile di sette giorni
 * (stessa ragione dei muri di ADR-055: un contatore che si azzera al riavvio è
 * un contatore che mente). Finestra mobile e non settimana di calendario,
 * deliberatamente: niente azzeramenti da schedulare, niente domanda «quando
 * comincia la settimana», e il momento in cui una mela "torna" è un fatto che
 * si legge dalla riga più vecchia.
 */

/** Sette giorni, la «settimana» del limite: mobile, non di calendario. */
const WINDOW_DAYS = 7;

export interface CustomerRewardDeps {
  db: DbClient;
  /** UGO_CUSTOMER_WEEKLY_REWARDS: `customers.weekly_reward_limit` lo scavalca */
  weeklyDefault: number;
  /**
   * La psiche viva dell'esemplare, se sta girando. Facoltativa come ovunque il
   * registro possa non avere (ancora) quella creatura: la mela resta contata e
   * ricordata comunque, e se l'umore del momento la perde è accettato — un
   * premio è un gesto del momento, non una partita contabile da riconciliare.
   *
   * Chiede casa E gosino, così il cablaggio usa `registry.all(householdId)` —
   * la vista di una casa — e mai `everywhere()`, che ha un solo chiamante
   * legittimo e non è questo.
   */
  psycheFor?: (
    householdId: string,
    gosinoId: string,
  ) => { applyEventType: (type: string, at: Date) => Promise<unknown> } | undefined;
}

export class RewardExhaustedError extends Error {
  public constructor(public readonly nextAt: Date | undefined) {
    super("weekly rewards exhausted");
  }
}

export class CustomerRewardService {
  public constructor(private readonly deps: CustomerRewardDeps) {}

  /** Quante ne restano — il dato che la reception mostra accanto alla mela. */
  public async allowance(customerId: string, at: Date = new Date()): Promise<ReceptionRewardAllowance> {
    const [customer] = await this.deps.db
      .select({ weeklyRewardLimit: customers.weeklyRewardLimit })
      .from(customers)
      .where(eq(customers.id, customerId));
    const limit = customer?.weeklyRewardLimit ?? this.deps.weeklyDefault;
    const since = new Date(at.getTime() - WINDOW_DAYS * 24 * 60 * 60_000);
    const given = await this.deps.db
      .select({ ts: customerRewards.ts })
      .from(customerRewards)
      .where(and(eq(customerRewards.customerId, customerId), gt(customerRewards.ts, since)))
      .orderBy(desc(customerRewards.ts));
    const remaining = Math.max(0, limit - given.length);
    const oldest = given.at(-1);
    return {
      weeklyLimit: limit,
      remaining,
      // quando la più vecchia esce dalla finestra: solo a mele finite, perché
      // solo lì la domanda «quando posso di nuovo?» esiste
      ...(remaining === 0 &&
        oldest !== undefined && {
          nextAt: new Date(oldest.ts.getTime() + WINDOW_DAYS * 24 * 60 * 60_000).toISOString(),
        }),
    };
  }

  /**
   * La mela. Conta, scrive, e solo alla fine — a riga già salvata — perturba
   * la psiche: se l'umore fallisse, la mela è comunque data e contata, mai il
   * contrario (una mela sentita ma non contata sarebbe un buco nel muro).
   */
  public async give(
    context: { householdId: string; customerId: string },
    gosinoId: string,
    at: Date = new Date(),
  ): Promise<ReceptionRewardAllowance> {
    const [assigned] = await this.deps.db
      .select({ id: customerGosini.id })
      .from(customerGosini)
      .where(
        and(eq(customerGosini.customerId, context.customerId), eq(customerGosini.gosinoId, gosinoId)),
      );
    if (assigned === undefined) throw new GosinoNotAssignedError();

    const before = await this.allowance(context.customerId, at);
    if (before.remaining === 0) {
      throw new RewardExhaustedError(before.nextAt === undefined ? undefined : new Date(before.nextAt));
    }

    // quale risposta l'ha meritata: l'ultima che questo gosino gli ha dato.
    // Risolta qui e non spedita dal client, che i suoi id non li ha mai visti.
    const [lastReply] = await this.deps.db
      .select({ id: customerMessages.id })
      .from(customerMessages)
      .where(
        and(
          eq(customerMessages.customerId, context.customerId),
          eq(customerMessages.gosinoId, gosinoId),
          eq(customerMessages.role, "assistant"),
        ),
      )
      .orderBy(desc(customerMessages.ts))
      .limit(1);

    await this.deps.db.insert(customerRewards).values({
      householdId: context.householdId,
      customerId: context.customerId,
      gosinoId,
      messageId: lastReply?.id ?? null,
      ts: at,
    });
    // la memoria episodica: ID e basta (regola 6), il sogno e il pannello
    // sanno da chi e per cosa senza che qui passi una parola del cliente
    await this.deps.db.insert(events).values({
      gosinoId,
      ts: at,
      source: "reception",
      type: "reward",
      payload: { customer: context.customerId, message: lastReply?.id ?? null },
    });
    await this.deps.psycheFor?.(context.householdId, gosinoId)?.applyEventType("reward", at);

    return this.allowance(context.customerId, at);
  }
}
