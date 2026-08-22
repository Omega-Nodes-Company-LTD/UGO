import { applyPerturbations, varsAt } from "./engine.js";
import {
  emptyState,
  PSYCHE_VARIABLES,
  type BaselineOverrides,
  type PsycheState,
  type PsycheVariable,
} from "./model.js";

/**
 * Lo screening in silico: la **giornata d'oro** (backlog gruppo 20).
 *
 * Il proprietario ha ridimensionato la voce originale, e la ragione conta più
 * del meccanismo: la selezione simulata «diventa una gara a chi ha più
 * server», quindi qui **non si sceglie il migliore**. Si fa girare una
 * giornata ordinaria dentro il motore della psiche e si buttano i **rotti** —
 * test binario, costo piatto, nessun punteggio. La selezione è il mestiere
 * dell'allevatore: tenerli, provarli con vita e lavoro veri, tenere i migliori.
 *
 * `screen()` guarda il **genoma fermo** (struttura, due degenerazioni
 * dichiarate). Questa guarda cosa succede quando quel genoma **vive**: ci sono
 * combinazioni che stanno nei limiti riga per riga e producono una creatura
 * inchiodata o che sbatte, e si vedono solo mettendola in moto.
 *
 * Le baseline arrivano da fuori, e non è pigrizia: la formula tratti→baseline
 * vive in un posto solo (`character.ts`), e riscriverla qui sarebbe una
 * seconda verità che un giorno divergerebbe da quella vera — cioè uno
 * screening che promuove creature diverse da quelle che nascono.
 */

/** Le ore che si guardano: una giornata intera, un campione ogni mezz'ora. */
const SAMPLES_PER_HOUR = 2;
const HOURS = 24;

/** Sopra/sotto questi valori una variabile sta a un **estremo**. */
const PINNED_HIGH = 0.97;
const PINNED_LOW = 0.03;

/** Quanta parte della giornata può passare a un estremo prima di far sospettare. */
const PINNED_SHARE = 0.6;

/**
 * E qui sta la differenza fra **inchiodata** e **intensa**, che è tutta la
 * ragione per cui questo screening può esistere senza diventare una selezione.
 *
 * La prima versione bocciava a un estremo e basta, e la prova l'ha smontata
 * subito: il gosino **più curioso che il sistema può produrre** — baseline
 * 0,95, che è il tetto di `characterFrom` — passa la giornata sopra 0,97
 * appena qualcosa lo incuriosisce. Bocciarlo vorrebbe dire buttare il diverso
 * invece del rotto, cioè fare esattamente la gara che il proprietario ha
 * escluso.
 *
 * Una variabile è **rotta** quando sta a un estremo *e non si muove più*: la
 * si spinge e non risponde. Una intensa sta in alto, si muove, e torna.
 */
const STUCK_RANGE = 0.02;

/** Sotto questa escursione l'umore non si muove: niente lo tocca. */
const MIN_MOOD_RANGE = 0.03;

/**
 * Quante inversioni di direzione dell'umore sono troppe.
 *
 * Una giornata vera ne ha poche: si sale, si scende, si risale. Una creatura
 * che ne fa una ogni campione non ha un carattere, ha un tremore.
 */
const MAX_MOOD_FLIPS = 24;

/**
 * La giornata: cose che capitano a chiunque, alle ore in cui capitano.
 *
 * Volutamente **ordinaria** e uguale per tutti — è la costante dell'esperimento.
 * Una giornata dura metterebbe fuori i fragili, una troppo dolce non metterebbe
 * fuori nessuno; questa serve a far muovere le variabili abbastanza da vedere
 * se sanno tornare.
 */
const GOLDEN_DAY: readonly { hour: number; variable: PsycheVariable; amount: number }[] = [
  { hour: 8, variable: "affetto", amount: 0.25 },
  { hour: 9, variable: "curiosita", amount: 0.2 },
  { hour: 11, variable: "stress", amount: 0.35 },
  { hour: 13, variable: "energia", amount: -0.2 },
  { hour: 15, variable: "noia", amount: 0.3 },
  { hour: 17, variable: "affetto", amount: 0.3 },
  { hour: 19, variable: "stress", amount: 0.25 },
  { hour: 21, variable: "umore", amount: 0.15 },
];

export interface GoldenDayVerdict {
  viable: boolean;
  reasons: string[];
}

/** Mezzanotte di un giorno qualunque: la data non entra nel risultato. */
const START = new Date("2026-01-01T00:00:00Z");

export function simulateGoldenDay(baselines: BaselineOverrides): GoldenDayVerdict {
  let state: PsycheState = emptyState();
  const samples: Record<PsycheVariable, number[]> = {} as Record<PsycheVariable, number[]>;
  for (const variable of PSYCHE_VARIABLES) samples[variable] = [];

  const step = 60 / SAMPLES_PER_HOUR;
  for (let minute = 0; minute < HOURS * 60; minute += step) {
    const at = new Date(START.getTime() + minute * 60_000);
    const hour = Math.floor(minute / 60);
    for (const event of GOLDEN_DAY) {
      if (event.hour * 60 === minute) {
        state = applyPerturbations(state, [{ variable: event.variable, amount: event.amount }], at);
      }
    }
    const vars = varsAt(state, at, hour, baselines);
    for (const variable of PSYCHE_VARIABLES) samples[variable].push(vars[variable]);
  }

  const reasons: string[] = [];

  for (const variable of PSYCHE_VARIABLES) {
    const values = samples[variable];
    const extreme = values.filter((v) => v >= PINNED_HIGH || v <= PINNED_LOW).length;
    const span = Math.max(...values) - Math.min(...values);
    if (extreme / values.length > PINNED_SHARE && span < STUCK_RANGE) {
      reasons.push(`${variable} inchiodata: la si spinge e non risponde`);
    }
  }

  const mood = samples.umore;
  const range = Math.max(...mood) - Math.min(...mood);
  if (range < MIN_MOOD_RANGE) {
    reasons.push("umore piatto: la giornata gli passa addosso senza toccarlo");
  }

  let flips = 0;
  for (let i = 2; i < mood.length; i += 1) {
    const before = (mood[i - 1] ?? 0) - (mood[i - 2] ?? 0);
    const after = (mood[i] ?? 0) - (mood[i - 1] ?? 0);
    if (before !== 0 && after !== 0 && Math.sign(before) !== Math.sign(after)) flips += 1;
  }
  if (flips > MAX_MOOD_FLIPS) {
    reasons.push("umore che sbatte: non è un carattere, è un tremore");
  }

  return reasons.length === 0 ? { viable: true, reasons: [] } : { viable: false, reasons };
}
