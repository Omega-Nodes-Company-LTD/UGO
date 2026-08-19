import {
  auditLog,
  beings,
  events,
  messages,
  perceptionEvents,
  type DbClient,
} from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, inAccount } from "./scope.js";

/**
 * Ciò che il pannello non poteva vedere (ADR-099).
 *
 * Tre viste in sola lettura, tre buchi che il gruppo 14 elencava da giorni:
 *
 * 1. **il giornale** (`audit_log`, ADR-049) — scritto da tre mesi e leggibile
 *    solo da `psql`. Un registro che il titolare non può guardare non è un
 *    registro: è un file. La DoD del gruppo 5 lo prometteva ispezionabile;
 * 2. **le conversazioni di casa** — il cliente della reception le ha
 *    (`/v1/reception/messages`), il proprietario no: vedeva un contatore. È
 *    la cosa più semplice da chiedere e l'unica che mancava;
 * 3. **chi è stato riconosciuto, e cosa ha visto** — `perception_events` non
 *    aveva superficie: né i volti riconosciuti né gli oggetti guardati.
 *
 * Tutte e tre **guardate e admin**: sono la biografia della casa, e chi entra
 * da un chiosco non deve poterla sfogliare.
 */

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const pageSchema = z.object({
  /** paginazione a cursore: `prima=<iso>` continua dall'ultima riga vista */
  prima: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  gosino: z.string().optional(),
});

export interface JournalDeps {
  db: DbClient;
  guard: PreHandler;
  /** la chiave della casa: le conversazioni sono ciphertext a riposo */
  dataKey: Buffer;
  /**
   * ADR-101: chi è collegato adesso. Lo sa `SceneHub` in RAM e non lo
   * esponeva a nessuno: il pannello non poteva dire se un chiosco è vivo,
   * quindi «UGO non risponde in cucina» si diagnosticava andando in cucina.
   */
  kiosks?: (accountId: string) => { room: string; screens: number }[];
}

/** Un testo leggibile, o il perché non lo è — mai un'eccezione in faccia. */
function readable(value: string, key: Buffer): string {
  try {
    return decryptText(value, key);
  } catch {
    return "[non decifrabile con la chiave corrente]";
  }
}

function before(raw: string | undefined): Date | undefined {
  if (raw === undefined) return undefined;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

export function registerJournalRoutes(app: FastifyInstance, deps: JournalDeps): void {
  /**
   * `GET /v1/audit` — il giornale che nessuno può riscrivere, finalmente
   * leggibile. Solo id, verbi ed esiti: è il patto di ADR-049 e questa vista
   * non lo allarga di una colonna.
   */
  app.get("/v1/audit", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "parametri non validi" });
    const limit = parsed.data.limite ?? DEFAULT_LIMIT;
    const cursor = before(parsed.data.prima);

    const rows = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      (db, accountId) =>
        db
          .select({
            id: auditLog.id,
            at: auditLog.at,
            verb: auditLog.verb,
            outcome: auditLog.outcome,
            role: auditLog.role,
            tokenId: auditLog.tokenId,
            resourceType: auditLog.resourceType,
            resourceId: auditLog.resourceId,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.accountId, accountId),
              ...(cursor === undefined ? [] : [lt(auditLog.at, cursor)]),
            ),
          )
          .orderBy(desc(auditLog.at))
          .limit(limit),
    );
    if (rows === undefined) return reply;
    return reply.send({
      righe: rows.map((row) => ({ ...row, at: row.at.toISOString() })),
      /** quanto indietro si può andare: la retention è dodici mesi (ADR-049) */
      retentionDays: 365,
    });
  });

  /**
   * `GET /v1/messages` — le conversazioni di casa.
   *
   * In chiaro, perché il proprietario ha diritto di rileggere ciò che si è
   * detto sotto il suo tetto — è lo stesso testo che l'export gli darebbe
   * (ADR-089), e negarlo qui sarebbe una privacy verso sé stessi.
   */
  app.get("/v1/messages", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "parametri non validi" });
    const limit = parsed.data.limite ?? DEFAULT_LIMIT;
    const cursor = before(parsed.data.prima);
    const asked = parsed.data.gosino;

    const rows = await inAccount(deps.db, request, reply, { requireAdmin: true }, (db, accountId) =>
      db
        .select({
          id: messages.id,
          ts: messages.ts,
          channel: messages.channel,
          role: messages.role,
          text: messages.text,
          gosinoId: messages.gosinoId,
          who: beings.displayName,
        })
        .from(messages)
        .leftJoin(beings, eq(beings.id, messages.beingId))
        .where(
          and(
            asked === undefined || asked === ""
              ? inArray(messages.gosinoId, exemplarsOf(db, accountId))
              : eq(messages.gosinoId, asked),
            ...(cursor === undefined ? [] : [lt(messages.ts, cursor)]),
          ),
        )
        .orderBy(desc(messages.ts))
        .limit(limit),
    );
    if (rows === undefined) return reply;
    return reply.send({
      messaggi: rows.map((row) => ({
        id: row.id,
        ts: row.ts.toISOString(),
        channel: row.channel,
        role: row.role,
        gosinoId: row.gosinoId,
        who: row.who,
        text: readable(row.text, deps.dataKey),
      })),
    });
  });

  /**
   * `GET /v1/jobs/reports` — cosa hanno fatto i job, l'ultima volta.
   *
   * I marcatori del sogno (`dream_step_completed`, ADR-025) sono già il
   * registro di ciò che è girato: ogni passo lascia data, nome e modalità.
   * Non servivano righe nuove — serviva **guardarle**: senza, «il backup di
   * stanotte è andato?» si rispondeva leggendo i log del container, che è
   * dove le domande vanno a morire.
   */
  app.get("/v1/jobs/reports", { preHandler: deps.guard }, async (request, reply) => {
    const rows = await inAccount(deps.db, request, reply, { requireAdmin: true }, (db, accountId) =>
      db
        .select({
          ts: events.ts,
          payload: events.payload,
          gosinoId: events.gosinoId,
        })
        .from(events)
        .where(
          and(
            eq(events.type, "dream_step_completed"),
            inArray(events.gosinoId, exemplarsOf(db, accountId)),
          ),
        )
        .orderBy(desc(events.ts))
        .limit(200),
    );
    if (rows === undefined) return reply;

    /**
     * L'ULTIMA volta per ogni passo, non le ultime duecento righe: la domanda
     * è «gira ancora?», e a quella risponde la riga più recente di ognuno.
     */
    const latest = new Map<string, { step: string; at: string; date: string; mode: string }>();
    for (const row of rows) {
      const payload = row.payload as { step?: string; date?: string; mode?: string };
      const step = payload.step ?? "?";
      if (latest.has(step)) continue;
      latest.set(step, {
        step,
        at: row.ts.toISOString(),
        date: payload.date ?? "?",
        mode: payload.mode ?? "full",
      });
    }
    return reply.send({ passi: [...latest.values()] });
  });

  /**
   * `GET /v1/kiosks` — quali schermi sono collegati adesso, e a quale stanza.
   */
  app.get("/v1/kiosks", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await inAccount(deps.db, request, reply, {}, (_db, id) => Promise.resolve(id));
    if (accountId === undefined) return reply;
    return reply.send({ chioschi: deps.kiosks?.(accountId) ?? [] });
  });

  /**
   * `GET /v1/perception` — chi è stato riconosciuto e quando, e cosa ha
   * guardato.
   *
   * **Mai l'impronta**: la riga dice il nome di chi il riconoscitore ha
   * creduto di vedere e quanto ci credeva. L'embedding è ciphertext e resta
   * dov'è (ADR-016) — questa vista serve a capire se il riconoscimento
   * funziona, non a esportarlo.
   */
  app.get("/v1/perception", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "parametri non validi" });
    const limit = parsed.data.limite ?? DEFAULT_LIMIT;
    const cursor = before(parsed.data.prima);

    const rows = await inAccount(deps.db, request, reply, { requireAdmin: true }, (db, accountId) =>
      db
        .select({
          id: perceptionEvents.id,
          ts: perceptionEvents.occurredAt,
          modality: perceptionEvents.modality,
          confidence: perceptionEvents.confidence,
          observed: perceptionEvents.observed,
          gosinoId: perceptionEvents.gosinoId,
          who: beings.displayName,
        })
        .from(perceptionEvents)
        .leftJoin(beings, eq(beings.id, perceptionEvents.beingId))
        .where(
          and(
            inArray(perceptionEvents.gosinoId, exemplarsOf(db, accountId)),
            ...(cursor === undefined ? [] : [lt(perceptionEvents.occurredAt, cursor)]),
          ),
        )
        .orderBy(desc(perceptionEvents.occurredAt))
        .limit(limit),
    );
    if (rows === undefined) return reply;
    return reply.send({
      incontri: rows.map((row) => ({
        id: row.id,
        ts: row.ts.toISOString(),
        modality: row.modality,
        gosinoId: row.gosinoId,
        who: row.who,
        confidence: row.confidence === null ? null : Number(row.confidence.toFixed(3)),
        // `observed` porta cosa il senso ha notato (un oggetto, una scena):
        // è testo breve, mai pixel — quelli non escono da qui (ADR-026)
        observed: row.observed,
      })),
    });
  });
}
