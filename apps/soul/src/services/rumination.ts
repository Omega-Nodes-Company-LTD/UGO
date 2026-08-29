import { desires, events, memories, messages, type DbClient } from "@ugo/db";
import type { LocalTextClient } from "@ugo/memory";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { PsycheService } from "./psycheService.js";

/**
 * La ruminazione (gruppo 10, ADR-059): pensa coi modelli locali.
 *
 * Da fermo UGO non era vuoto — volizione, solitudine, sogno — ma non ruminava:
 * fra un tick e l'altro la sua testa era una funzione matematica del tempo.
 * Questo servizio gli dà il pensiero di mezzo: ogni tanto, quando è idle e
 * l'Ollama di casa è acceso, pesca due ricordi e prova un accostamento, si fa
 * venire una domanda da farti, o scambia due battute con l'altro gosino.
 *
 * Le regole dure, che sono la ragione per cui questo può girare sempre:
 *
 * - **mai il provider**: solo `LocalTextClient`. Il `budget_ledger` non deve
 *   nemmeno vederlo passare — ruminare è gratis o non è;
 * - **ciò che produce passa dal vaglio del sogno**: l'accostamento finisce in
 *   `events` (che `reflect` legge già, riga per riga) e diventa memoria solo
 *   se il sogno lo distilla. Un modello piccolo che rumina male non deve
 *   potersi scrivere le fantasie in biografia da solo;
 * - **la domanda usa il canale che esiste**: un desiderio `pending`, che
 *   `sayDesire` tirerà fuori quando le pressioni lo decidono — la ruminazione
 *   non parla MAI direttamente, si segna le cose;
 * - **di notte si dorme**: nelle ore di quiete rumina il sogno, non lui.
 */

/** La notte è del sogno: fuori da questa finestra la testa tace. */
const AWAKE_FROM = 8;
const AWAKE_UNTIL = 22;
/**
 * Quanti desideri PENDENTI possono stare in coda da una sorgente generativa.
 * Oltre, la ruminazione si trattiene: una notte di domande inventate non deve
 * riempire il risveglio. I comandi espliciti dell'utente non passano da qui.
 */
const MAX_PENDING_DESIRES = 5;
/** Con un messaggio più recente di così non è idle: sta vivendo, non rumina. */
const IDLE_MIN = 20;
/** Fra un pensiero e l'altro — anche a vuoto: contano i tentativi, non i successi. */
const DEFAULT_GAP_MIN = 45;
/** Una battuta più lunga di così non è una battuta: si tronca il pensiero, non il testo. */
const SHORT_ENOUGH = 300;

export interface Ruminator {
  id: string;
  /** ADR-098: chi rumina lo fa nella SUA casa, e sulla sua connessione */
  accountId: string;
  name: string;
  psyche: PsycheService;
}

export interface RuminationDeps {
  /** ADR-098: la connessione della casa del ruminante */
  dbFor: (accountId: string) => DbClient;
  local: LocalTextClient;
  /** la sonda di `index.ts`: il modello locale c'è ed è vivo */
  localUp: () => boolean;
  /** l'ora nel fuso della casa (ADR-050) */
  hourOf: (at: Date) => number;
  enabled: () => boolean;
  gapMin?: number;
  /**
   * Da dove escono le sue decisioni. Iniettabile per la stessa ragione di
   * `Wanderer`: senza, «a volte si fa una domanda» non è un test ma una
   * moneta lanciata in aria.
   */
  dice?: () => number;
}

export type RuminationReport =
  | { did: "nothing" }
  | { did: "association" | "question" | "chat" };

export class RuminationService {
  public constructor(private readonly deps: RuminationDeps) {}

  private get dice(): () => number {
    return this.deps.dice ?? Math.random;
  }

  /**
   * Un giro di testa per UNA creatura. Chiamato dal loop delle iniziative —
   * stesso battito, stesso sfalsamento — così non esiste un secondo ciclo
   * server-wide da tenere d'occhio.
   */
  public async maybe(
    self: Ruminator,
    mates: readonly Ruminator[],
    at: Date = new Date(),
  ): Promise<RuminationReport> {
    if (!this.deps.enabled() || !this.deps.localUp()) return { did: "nothing" };
    const hour = this.deps.hourOf(at);
    if (hour < AWAKE_FROM || hour >= AWAKE_UNTIL) return { did: "nothing" };
    const db = this.deps.dbFor(self.accountId);
    if (await this.busy(db, self.id, at)) return { did: "nothing" };
    if (await this.mulledRecently(db, self.id, at)) return { did: "nothing" };

    const roll = this.dice();
    if (mates.length > 0 && roll < 0.2) {
      const mate = mates[Math.floor(this.dice() * mates.length)];
      if (mate !== undefined) return this.chat(db, self, mate, at);
    }
    if (roll < 0.6) return this.associate(db, self, at);
    return this.wonder(db, self, at);
  }

  /** Sta vivendo (un messaggio recente): la ruminazione è il tempo vuoto. */
  private async busy(db: DbClient, gosinoId: string, at: Date): Promise<boolean> {
    const since = new Date(at.getTime() - IDLE_MIN * 60_000);
    const [row] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.gosinoId, gosinoId), gte(messages.ts, since)))
      .limit(1);
    return row !== undefined;
  }

  /**
   * Il distanziatore, ancorato ai TENTATIVI: anche una ruminazione venuta a
   * vuoto lascia la sua riga, o un modello locale svogliato verrebbe
   * martellato a ogni tick.
   */
  private async mulledRecently(db: DbClient, gosinoId: string, at: Date): Promise<boolean> {
    const gap = this.deps.gapMin ?? DEFAULT_GAP_MIN;
    const since = new Date(at.getTime() - gap * 60_000);
    const [row] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.gosinoId, gosinoId),
          inArray(events.type, ["rumination", "peer_chat"]),
          gte(events.ts, since),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /** Due ricordi vivi: uno fresco, uno che pesa. Meno di due = niente testa. */
  private async pickMemories(
    db: DbClient,
    gosinoId: string,
  ): Promise<{ id: string; text: string }[]> {
    const fresh = await db
      .select({ id: memories.id, text: memories.text })
      .from(memories)
      .where(and(eq(memories.gosinoId, gosinoId), isNull(memories.invalidatedAt)))
      .orderBy(desc(memories.createdAt))
      .limit(20);
    const heavy = await db
      .select({ id: memories.id, text: memories.text })
      .from(memories)
      .where(and(eq(memories.gosinoId, gosinoId), isNull(memories.invalidatedAt)))
      .orderBy(desc(memories.importance))
      .limit(50);
    const anchor = fresh[Math.floor(this.dice() * fresh.length)];
    if (anchor === undefined) return [];
    const others = heavy.filter((m) => m.id !== anchor.id);
    const partner = others[Math.floor(this.dice() * others.length)];
    return partner === undefined ? [anchor] : [anchor, partner];
  }

  /**
   * L'accostamento: due ricordi, un eventuale nesso. L'esito va in `events`
   * — riga che il sogno legge già — e in memoria ci arriva SOLO se il sogno
   * lo distilla. Anche il buco nell'acqua lascia la riga: è il distanziatore.
   */
  private async associate(db: DbClient, self: Ruminator, at: Date): Promise<RuminationReport> {
    const picked = await this.pickMemories(db, self.id);
    if (picked.length < 2) return { did: "nothing" };
    const [a, b] = picked;
    if (a === undefined || b === undefined) return { did: "nothing" };
    const prompt =
      `Sei ${self.name}, un maialino domestico sveglio e ironico. Ti girano in testa due ricordi:\n` +
      `A: ${a.text}\nB: ${b.text}\n` +
      `C'è un nesso interessante o utile fra i due? Se sì, dillo in UNA frase in italiano, ` +
      `in prima persona. Se non c'è, rispondi solo: NIENTE.`;
    const out = (await this.deps.local.generate(prompt, 120))?.trim();
    const worthless = out === undefined || out === "" || /^niente\b/i.test(out) || out.length > SHORT_ENOUGH;
    await db.insert(events).values({
      gosinoId: self.id,
      ts: at,
      source: "system",
      type: "rumination",
      payload: worthless ? { about: [a.id, b.id] } : { about: [a.id, b.id], thought: out },
    });
    return worthless ? { did: "nothing" } : { did: "association" };
  }

  /**
   * La domanda: nasce da un ricordo e si mette in fila come desiderio
   * `pending`. Non viene detta ADESSO — la dirà `sayDesire` quando le
   * pressioni lo decidono, che è come UGO tira fuori tutto il resto.
   */
  private async wonder(db: DbClient, self: Ruminator, at: Date): Promise<RuminationReport> {
    const picked = await this.pickMemories(db, self.id);
    const seed = picked[0];
    if (seed === undefined) return { did: "nothing" };
    const prompt =
      `Sei ${self.name}, un maialino domestico curioso. Ripensi a questo: «${seed.text}». ` +
      `Ti è venuta una domanda VERA da fare al tuo umano — breve, concreta, in italiano. ` +
      `Scrivi solo la domanda. Se non te ne viene nessuna, rispondi solo: NIENTE.`;
    const out = (await this.deps.local.generate(prompt, 80))?.trim();
    const worthless = out === undefined || out === "" || /^niente\b/i.test(out) || out.length > SHORT_ENOUGH;
    await db.insert(events).values({
      gosinoId: self.id,
      ts: at,
      source: "system",
      type: "rumination",
      payload: worthless ? { about: [seed.id] } : { about: [seed.id], asked: true },
    });
    if (worthless) return { did: "nothing" };
    // Tetto ai desideri PENDENTI da sorgenti generative (ADR-103 spirito):
    // la ruminazione allucina raramente, ma una notte di domande inventate non
    // deve riempire la coda del risveglio. I comandi espliciti dell'utente
    // (promemoria, timer) non passano da qui.
    const [pending] = await db
      .select({ count: sql<number>`count(*)` })
      .from(desires)
      .where(and(eq(desires.gosinoId, self.id), eq(desires.status, "pending")));
    if ((pending?.count ?? 0) >= MAX_PENDING_DESIRES) {
      return { did: "nothing" };
    }
    await db.insert(desires).values({
      gosinoId: self.id,
      text: out,
      dueHint: "quando c'è occasione",
    });
    return { did: "question" };
  }

  /**
   * Due battute con l'altro gosino, fuori scena: nessuno parla a voce alta
   * (per definizione qui non c'è nessuno a sentire), ma lo scambio resta
   * nella giornata di ENTRAMBI — il sogno lo vede, e rivedersi scalda come
   * un saluto (`peer_greeted`, coi suoi tetti).
   */
  private async chat(db: DbClient, self: Ruminator, mate: Ruminator, at: Date): Promise<RuminationReport> {
    const picked = await this.pickMemories(db, self.id);
    const topic = picked[0];
    if (topic === undefined) return { did: "nothing" };
    const opening = (
      await this.deps.local.generate(
        `Sei ${self.name}, un maialino domestico. Vicino a te c'è ${mate.name}, un altro maialino. ` +
          `Digli UNA battuta breve, in italiano, su questo pensiero: «${topic.text}».`,
        60,
      )
    )?.trim();
    if (opening === undefined || opening === "" || opening.length > SHORT_ENOUGH) {
      return { did: "nothing" };
    }
    const reply = (
      await this.deps.local.generate(
        `Sei ${mate.name}, un maialino domestico. ${self.name} ti ha appena detto: «${opening}». ` +
          `Rispondigli con UNA battuta breve, in italiano.`,
        60,
      )
    )?.trim();
    const heard = reply === undefined || reply === "" || reply.length > SHORT_ENOUGH ? undefined : reply;
    await db.insert(events).values([
      {
        gosinoId: self.id,
        ts: at,
        source: "system",
        type: "peer_chat",
        payload: { with: mate.id, said: opening, ...(heard !== undefined && { heard }) },
      },
      {
        gosinoId: mate.id,
        ts: at,
        source: "system",
        type: "peer_chat",
        payload: { with: self.id, heard: opening, ...(heard !== undefined && { said: heard }) },
      },
    ]);
    await self.psyche.applyEventType("peer_greeted", at);
    await mate.psyche.applyEventType("peer_greeted", at);
    return { did: "chat" };
  }
}
