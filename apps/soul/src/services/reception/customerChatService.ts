import {
  customerGosini,
  customerMessages,
  customers,
  gosini,
  accounts,
  tickets,
  traitSets,
  type DbClient,
} from "@ugo/db";
import {
  searchCustomerChunks,
  type EmbeddingsClient,
  type ChatLlm,
  type LlmHistoryTurn,
} from "@ugo/memory";
import {
  decryptText,
  encryptText,
  receptionLookSchema,
  type ReceptionLook,
} from "@ugo/shared";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { characterFrom } from "../council/character.js";
import type { AuditLogger } from "../auditLog.js";
import type { AnswerCache } from "./answerCache.js";
import type { CustomerContext } from "./customerAuth.js";
import type { CustomerQuota } from "./customerQuota.js";
import type { GithubLiveService } from "./githubLiveService.js";

/**
 * The reception's conversation (ADR-052/055). Reuses `LlmClient` — the one
 * provider chokepoint (rule 3) — on the `ticket` channel, where the second
 * cached block is the reception's rules. Everything customer-specific goes in
 * `dynamicSystem`, never in the cached blocks.
 */

export class GosinoNotAssignedError extends Error {}

const HISTORY_TURNS = 8;
const HISTORY_WINDOW_HOURS = 12;

/** wall 2's voice (ADR-055): declared, courteous, and never an error */
export const CUSTOMER_BUDGET_REPLY =
  "Per oggi ho esaurito il tempo che posso dedicarti; il ticket resta aperto e domani ci sono.";

/** the deterministic ticket shortcut: zero provider tokens (ADR-055) */
const TICKET_PREFIX = /^apri\s+(?:un\s+)?ticket[:\s]+(.+)$/is;

/**
 * The guide shortcut: «fammi una guida: nell'app X come imposto il titolo?».
 * Unlike the ticket it DOES call the provider — a guide is written, not
 * collected — but the switch is deterministic and derived from the QUESTION,
 * so a cached repeat (ADR-055) keeps its `guide` flag without re-parsing
 * the answer. The format instruction travels in the DYNAMIC block: the
 * cached prefix does not change by a byte (rule 2).
 */
const GUIDE_PREFIX = /^(?:fammi|famme|scrivimi|preparami|crea(?:mi)?)\s+una\s+guida[:\s]+(.+)$/is;

export function isGuideRequest(text: string): boolean {
  return GUIDE_PREFIX.test(text.trim());
}

/**
 * Detto al modello nel blocco dinamico, solo quando la domanda è una guida.
 * Niente markdown e niente emoji: il testo va dritto in un PDF (WinAnsi),
 * e una guida per chi «vuole il tempo sotto mano» è fatta di passi corti,
 * non di formattazione.
 */
const GUIDE_INSTRUCTION =
  "Il cliente ti chiede una GUIDA scritta. Rispondi SOLO con la guida, così:\n" +
  "- prima riga: il titolo della guida, breve e concreto;\n" +
  "- poi i passi numerati (1. 2. 3.), UN'azione per passo, frasi corte;\n" +
  "- spiega come a un principiante assoluto: di' dove cliccare per nome, cosa si vede dopo, " +
  "e come capire se il passo è riuscito;\n" +
  "- se serve un prerequisito, dillo nel passo 1;\n" +
  "- chiudi con una riga «Se qualcosa non torna: …» con il rimedio più probabile;\n" +
  "- niente saluti, niente commenti prima o dopo, niente markdown, niente emoji.";

/** how many knowledge chunks reach the prompt (ADR-054) */
const CHUNKS_K = 8;

/**
 * Questions about the LIVE state of the work (ADR-054/055): they wake the
 * GitHub adapter, and their answers are never cached — true only in the
 * moment they are asked.
 */
const LIVE_STATE = /\b(pr|pull request|commit|pipeline|deploy|stato dei lavori|a che punto|novit[aà])\b/i;

export function isLiveStateQuestion(text: string): boolean {
  return LIVE_STATE.test(text);
}

export interface HouseClock {
  timezone: string;
  locale: string;
}

export interface CustomerChatDeps {
  db: DbClient;
  /** ADR-098: la connessione della casa del cliente; assente = `db` */
  dbFor?: (accountId: string) => DbClient;
  dataKey: Buffer;
  quota: CustomerQuota;
  llmFor: (accountId: string, gosinoId: string, clock?: HouseClock) => ChatLlm;
  audit?: AuditLogger;
  /** ADR-054: without it the gosino answers from tickets and history alone */
  embedder?: EmbeddingsClient;
  /** ADR-054: live PRs/commits, only when a repo actually points at GitHub */
  github?: GithubLiveService;
  /** ADR-055 wall 3: the repeated question costs nothing */
  cache?: AnswerCache;
  /**
   * ADR-115: come sta il gosino, adesso.
   *
   * Una funzione e non una psiche: la reception non deve poter *muovere* uno
   * stato d'animo, solo leggerlo — e leggerlo **quando risponde**, mai in
   * continuo. Assente = la reception disegna un corpo fermo, che è ciò che
   * faceva prima.
   */
  moodOf?: (gosinoId: string) => { label: string; vars: Record<string, number> } | undefined;
}

export type CustomerChatResult =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | {
      kind: "ok";
      reply: string;
      degraded: boolean;
      cached: boolean;
      ticketId?: string;
      /** the reply is a step-by-step guide: the client offers the PDF */
      guide?: boolean;
      /** ADR-115: come sta, attaccato alla risposta e non a un canale aperto */
      mood?: { label: string; vars: Record<string, number> };
    };

export interface CustomerChatRequest {
  context: CustomerContext;
  gosinoId: string;
  text: string;
}

export class CustomerChatService {
  public constructor(private readonly deps: CustomerChatDeps) {}

  /** ADR-098/tempo 2b: la connessione della casa del cliente; assente = `db` */
  private dbOf(accountId: string): DbClient {
    return this.deps.dbFor?.(accountId) ?? this.deps.db;
  }

  /** The gosini this customer may talk to — the picker's list. */
  /**
   * ADR-115: e **com'è fatto**, perché la reception possa disegnarlo.
   *
   * Escono gli otto geni del corpo e nient'altro: aspetto, mai temperamento.
   * È la regola della vetrina (ADR-083) con un motivo in più — il cliente non è
   * di casa, e quanto è affettuoso il gosino di qualcun altro non sono affari
   * suoi. Il `look` è **facoltativo**: senza trait set si disegna quello medio,
   * che è esattamente ciò che si vedeva prima.
   */
  public async assignedGosini(
    context: CustomerContext,
  ): Promise<
    { id: string; name: string; locationLabel: string | null; look?: ReceptionLook }[]
  > {
    const db = this.dbOf(context.accountId);
    const rows = await db
      .select({ id: gosini.id, name: gosini.name, locationLabel: gosini.locationLabel })
      .from(customerGosini)
      .innerJoin(gosini, eq(gosini.id, customerGosini.gosinoId))
      .where(eq(customerGosini.customerId, context.customerId))
      .orderBy(gosini.bornAt);

    const out: { id: string; name: string; locationLabel: string | null; look?: ReceptionLook }[] =
      [];
    for (const row of rows) {
      const [set] = await db
        .select({ traits: traitSets.traits })
        .from(traitSets)
        .where(eq(traitSets.gosinoId, row.id))
        .orderBy(desc(traitSets.version))
        .limit(1);
      const parsed = receptionLookSchema.safeParse(characterFrom(set?.traits).traits);
      out.push({ ...row, ...(parsed.success && { look: parsed.data }) });
    }
    return out;
  }

  public async handle(
    request: CustomerChatRequest,
    at: Date = new Date(),
  ): Promise<CustomerChatResult> {
    const { quota } = this.deps;
    const { context, gosinoId } = request;
    const db = this.dbOf(context.accountId);

    // 404 for a gosino that is not assigned — including one of another house
    const [assignment] = await db
      .select({ id: customerGosini.id })
      .from(customerGosini)
      .where(
        and(
          eq(customerGosini.customerId, context.customerId),
          eq(customerGosini.gosinoId, gosinoId),
        ),
      );
    if (assignment === undefined) throw new GosinoNotAssignedError(gosinoId);

    const verdict = await quota.check(context.customerId, at, context.accountId);
    if (!verdict.allowed && verdict.wall === "hourly") {
      // nothing is persisted: a refused knock must not tighten the quota
      return { kind: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds };
    }
    if (!verdict.allowed) {
      // wall 2: declared degradation, zero provider calls, the turn persists
      await this.persistTurns(request, CUSTOMER_BUDGET_REPLY, at, { degraded: true });
      return { kind: "ok", reply: CUSTOMER_BUDGET_REPLY, degraded: true, cached: false };
    }

    // the deterministic shortcut: an explicit "apri un ticket: ..." never
    // spends a token — the request is already in the customer's own words
    const shortcut = TICKET_PREFIX.exec(request.text.trim());
    if (shortcut?.[1] !== undefined) {
      const ticketId = await this.collectTicket(request, shortcut[1].trim(), at);
      const reply = "Fatto, ho aperto il ticket. Lo studio lo vedrà e ti aggiorno qui.";
      await this.persistTurns(request, reply, at, { ticketId });
      return { kind: "ok", reply, degraded: false, cached: false, ticketId, ...this.mood(gosinoId) };
    }

    // a guide is a question like the others: quota, cache and budget valgono.
    // Il flag deriva dalla DOMANDA, così il replay dalla cache lo conserva.
    const guide = isGuideRequest(request.text);

    // wall 3 (ADR-055): never for live-state questions — those are true only
    // in the moment they are asked
    const live = isLiveStateQuestion(request.text);
    const cacheKey = { accountId: context.accountId, customerId: context.customerId, gosinoId };
    if (!live) {
      const remembered = await this.deps.cache?.lookup(cacheKey, request.text, at);
      if (remembered !== undefined) {
        await this.persistTurns(request, remembered, at, { cached: true });
        return {
          kind: "ok",
          reply: remembered,
          degraded: false,
          cached: true,
          ...(guide && { guide }),
          ...this.mood(gosinoId),
        };
      }
    }

    const [house] = await db
      .select({ timezone: accounts.timezone, locale: accounts.locale })
      .from(accounts)
      .where(eq(accounts.id, context.accountId));
    const clock: HouseClock | undefined =
      house === undefined ? undefined : { timezone: house.timezone, locale: house.locale };

    const llm = this.deps.llmFor(context.accountId, gosinoId, clock);
    const dynamicSystem = await this.buildDynamicSystem(request, at);
    const result = await llm.chat(
      {
        channel: "ticket",
        // l'istruzione della guida vive QUI, nel dinamico: il prefisso
        // cached non cambia di un byte (regola 2)
        dynamicSystem: guide ? `${dynamicSystem}\n\n${GUIDE_INSTRUCTION}` : dynamicSystem,
        history: await this.loadHistory(request, at),
        userText: request.text,
      },
      at,
    );
    await this.persistTurns(request, result.text, at, {
      degraded: result.degraded,
      ...(result.usage !== undefined && {
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
      }),
      ...(result.costUsd !== undefined && { costUsd: result.costUsd }),
    });
    // a paid, non-degraded, non-live answer is worth remembering (ADR-055)
    if (!live && !result.degraded) {
      await this.deps.cache?.store(cacheKey, request.text, result.text, at);
    }
    return {
      kind: "ok",
      reply: result.text,
      degraded: result.degraded,
      cached: false,
      // degradata = la voce del muro, non una guida: niente PDF da offrire
      ...(guide && !result.degraded && { guide }),
      ...this.mood(gosinoId),
    };
  }

  /**
   * Come sta, se qualcuno può dirlo (ADR-115).
   *
   * Sta in un metodo solo perché va attaccato a **ogni** risposta, comprese
   * quelle che non costano niente: se l'umore accompagnasse solo le risposte
   * a pagamento, il corpo si fermerebbe di colpo quando il cliente ripete una
   * domanda — e sembrerebbe un guasto invece di una cache che funziona.
   */
  private mood(gosinoId: string): { mood?: { label: string; vars: Record<string, number> } } {
    const now = this.deps.moodOf?.(gosinoId);
    return now === undefined ? {} : { mood: now };
  }

  /** A ticket collected on the customer's explicit words (ADR-052). */
  public async collectTicket(
    request: CustomerChatRequest,
    text: string,
    at: Date,
  ): Promise<string> {
    const { dataKey, audit } = this.deps;
    const db = this.dbOf(request.context.accountId);
    const [firstLine = ""] = text.split("\n", 1);
    const title = firstLine.slice(0, 200) || "Richiesta dalla reception";
    const [row] = await db
      .insert(tickets)
      .values({
        accountId: request.context.accountId,
        customerId: request.context.customerId,
        gosinoId: request.gosinoId,
        title: encryptText(title, dataKey),
        body: encryptText(text, dataKey),
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: tickets.id });
    if (row === undefined) throw new Error("ticket was not persisted");
    await audit?.record({
      verb: "ticket_created",
      outcome: "ok",
      accountId: request.context.accountId,
      resourceType: "ticket",
      resourceId: row.id,
    });
    return row.id;
  }

  /** blocks 3+ of the prompt: the customer's world, never cached (rule 2) */
  private async buildDynamicSystem(request: CustomerChatRequest, at: Date): Promise<string> {
    const { dataKey, embedder, github } = this.deps;
    const db = this.dbOf(request.context.accountId);
    const [customer] = await db
      .select({ name: customers.name, digest: customers.digest, digestAt: customers.digestAt })
      .from(customers)
      .where(eq(customers.id, request.context.customerId));

    // ADR-054: the knowledge index, decrypted only here, only the top-k
    const knowledge: string[] = [];
    if (embedder !== undefined) {
      const chunks = await searchCustomerChunks(
        db,
        embedder,
        request.text,
        CHUNKS_K,
        request.context.customerId,
        request.context.accountId,
      );
      for (const chunk of chunks) {
        try {
          knowledge.push(`[${chunk.sourceType} ${chunk.ref}]\n${decryptText(chunk.text, dataKey)}`);
        } catch {
          // unreadable chunk (rotated key): the answer goes on without it
        }
      }
    }
    // the live state only when the question is about the live state
    const live =
      github !== undefined && isLiveStateQuestion(request.text)
        ? await github.liveBlock(request.context.customerId, at, request.context.accountId)
        : undefined;
    const openTickets = await db
      .select({ id: tickets.id, title: tickets.title, status: tickets.status })
      .from(tickets)
      .where(
        and(eq(tickets.customerId, request.context.customerId), ne(tickets.status, "closed")),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(10);
    const lines = [
      `Sei alla reception con il cliente «${customer?.name ?? "cliente"}». Ora: ${at.toISOString()}.`,
    ];
    if (openTickets.length > 0) {
      lines.push("Ticket aperti del cliente:");
      for (const ticket of openTickets) {
        let title: string;
        try {
          title = decryptText(ticket.title, dataKey);
        } catch {
          continue;
        }
        lines.push(`- [${ticket.status}] ${title}`);
      }
    } else {
      lines.push("Il cliente non ha ticket aperti al momento.");
    }
    if (knowledge.length > 0) {
      lines.push("Contesto dal lavoro del cliente (repo, documenti, email):");
      lines.push(...knowledge);
    }
    if (live !== undefined) lines.push(live);
    else if (isLiveStateQuestion(request.text) && customer?.digest != null) {
      // il ripiego pre-calcolato (backlog gruppo 8): quando lo stato vivo non
      // c'è — niente repo GitHub, adapter spento — la domanda «a che punto
      // siamo» trovava il vuoto. Il sogno scrive la fotografia ogni notte; la
      // data accanto è ciò che la rende onesta invece che spacciata per viva.
      try {
        const when =
          customer.digestAt === null ? "" : ` (aggiornato al ${customer.digestAt.toISOString().slice(0, 10)})`;
        lines.push(`Il punto dei lavori${when}:\n${decryptText(customer.digest, dataKey)}`);
      } catch {
        // chiave ruotata: la risposta va avanti senza il digest
      }
    }
    return lines.join("\n");
  }

  private async loadHistory(
    request: CustomerChatRequest,
    at: Date,
  ): Promise<LlmHistoryTurn[]> {
    const { dataKey } = this.deps;
    const db = this.dbOf(request.context.accountId);
    const windowStart = new Date(at.getTime() - HISTORY_WINDOW_HOURS * 3_600_000);
    const rows = await db
      .select({ role: customerMessages.role, text: customerMessages.text })
      .from(customerMessages)
      .where(
        and(
          eq(customerMessages.customerId, request.context.customerId),
          eq(customerMessages.gosinoId, request.gosinoId),
          gt(customerMessages.ts, windowStart),
        ),
      )
      .orderBy(desc(customerMessages.ts))
      .limit(HISTORY_TURNS);
    const history: LlmHistoryTurn[] = [];
    for (const row of rows.reverse()) {
      if (row.role !== "user" && row.role !== "assistant") continue;
      try {
        history.push({ role: row.role, content: decryptText(row.text, dataKey) });
      } catch {
        // unreadable turn (rotated key): the conversation goes on without it
      }
    }
    return history;
  }

  private async persistTurns(
    request: CustomerChatRequest,
    reply: string,
    at: Date,
    extra: {
      degraded?: boolean;
      cached?: boolean;
      ticketId?: string;
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
    } = {},
  ): Promise<void> {
    const { dataKey } = this.deps;
    const db = this.dbOf(request.context.accountId);
    const base = {
      accountId: request.context.accountId,
      customerId: request.context.customerId,
      gosinoId: request.gosinoId,
      ...(extra.ticketId !== undefined && { ticketId: extra.ticketId }),
    };
    await db.insert(customerMessages).values([
      {
        ...base,
        ts: at,
        role: "user",
        text: encryptText(request.text, dataKey),
      },
      {
        ...base,
        // one ms later, so history ordering never interleaves the pair
        ts: new Date(at.getTime() + 1),
        role: "assistant",
        text: encryptText(reply, dataKey),
        tokensIn: extra.tokensIn ?? 0,
        tokensOut: extra.tokensOut ?? 0,
        costUsd: (extra.costUsd ?? 0).toFixed(6),
        cached: extra.cached ?? false,
      },
    ]);
  }
}
