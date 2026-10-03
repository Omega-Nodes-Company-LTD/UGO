/**
 * I piani (ADR-125): cosa sblocca ognuno. I PREZZI non stanno qui — stanno nel
 * PSP (Stripe, PayPal): il codice sa cosa si può fare, non quanto costa.
 *
 * Puro e testato: un limite che cambia è un rilascio, non una riga di
 * configurazione che nessuno rilegge.
 */

export const PLAN_IDS = ["free", "pro", "allevamento"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Le capacità: un numero è un tetto (`null` = senza tetto), un booleano è un sì/no. */
export interface Entitlements {
  /** quanti gosini può avere la casa */
  gosini: number | null;
  /** quante stanze */
  rooms: number | null;
  /** voce e orecchie sintetiche (ADR-123); senza, quelle del browser */
  voice: boolean;
  /** il sogno notturno (ADR-023, ADR-129) */
  dream: boolean;
  album: boolean;
  meetings: boolean;
  /** la piazza virtuale (ADR-132) */
  plaza: boolean;
  /** vendere in vetrina a pagamento (ADR-131): serve ANCHE il permesso da CLI */
  breedingSales: boolean;
}

export const PLANS: Readonly<Record<PlanId, Readonly<Entitlements>>> = {
  free: {
    gosini: 1,
    rooms: 1,
    voice: false,
    dream: false,
    album: false,
    meetings: false,
    plaza: false,
    breedingSales: false,
  },
  pro: {
    gosini: 3,
    rooms: null,
    voice: true,
    dream: true,
    album: true,
    meetings: true,
    plaza: true,
    breedingSales: false,
  },
  allevamento: {
    gosini: 3,
    rooms: null,
    voice: true,
    dream: true,
    album: true,
    meetings: true,
    plaza: true,
    breedingSales: true,
  },
};

/** Il nome che vede la famiglia. */
export const PLAN_LABEL: Readonly<Record<PlanId, string>> = {
  free: "Free",
  pro: "Pro",
  allevamento: "Allevamento",
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export type Capability = keyof Entitlements;
export type Toggle = { [K in Capability]: Entitlements[K] extends boolean ? K : never }[Capability];
export type Quota = Exclude<Capability, Toggle>;

/** Sta nel tetto? `count` è quante ce ne sono GIÀ, prima di aggiungerne una. */
export function withinQuota(plan: PlanId, quota: Quota, count: number): boolean {
  const cap = PLANS[plan][quota];
  return cap === null || count < cap;
}

/**
 * Lo stato di un abbonamento che vale: Stripe e PayPal li chiamano in modo
 * diverso, qui si parla una lingua sola. `past_due` vale ancora — il PSP
 * riprova la carta per giorni, e una creatura non si spegne per un addebito
 * rimandato (ADR-125 §6).
 */
export const LIVE_SUBSCRIPTION = ["active", "trialing", "past_due"] as const;

/**
 * Il piano effettivo (ADR-125 §3): l'abbonamento vivo, altrimenti la
 * concessione dell'operatore, altrimenti free. Fra i due vince il più ricco:
 * una fonderia che si abbona Pro per sbaglio non perde l'allevamento.
 */
export function effectivePlan(input: {
  subscription?: { plan: string; status: string } | undefined;
  grant?: string | null | undefined;
}): PlanId {
  const rank = (plan: PlanId): number => PLAN_IDS.indexOf(plan);
  const fromSub =
    input.subscription !== undefined &&
    (LIVE_SUBSCRIPTION as readonly string[]).includes(input.subscription.status) &&
    isPlanId(input.subscription.plan)
      ? input.subscription.plan
      : "free";
  const fromGrant = isPlanId(input.grant) ? input.grant : "free";
  return rank(fromSub) >= rank(fromGrant) ? fromSub : fromGrant;
}
