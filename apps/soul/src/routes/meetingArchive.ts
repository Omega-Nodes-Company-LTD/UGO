import { gosini, meetings, transcriptSegments, type DbClient } from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AuditLogger } from "../services/auditLog.js";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, inAccount } from "./scope.js";

/**
 * L'archivio delle riunioni (ADR-104).
 *
 * L'elenco stava in `archive.ts`, insieme ai ricordi, e ci stava stretto: una
 * riunione non è una cosa che UGO ricorda, è una cosa che **altre persone
 * hanno detto** e che noi conserviamo. Da quando le porte sono tre — elencare,
 * rileggere, buttare — la differenza vale un file.
 *
 * Si registra **sempre**, anche senza il servizio delle riunioni configurato:
 * una casa che ha registrato e poi ha staccato l'integrazione non deve restare
 * con trascrizioni che non può né rileggere né cancellare.
 */

const RECENT_LIMIT = 30;

export interface MeetingArchiveDeps {
  db: DbClient;
  guard: PreHandler;
  /** ADR-104: rileggere non lascia traccia, buttare sì */
  audit: AuditLogger;
  /** le trascrizioni sono ciphertext a riposo (regola 6) */
  dataKey?: Buffer | undefined;
}

export function registerMeetingArchiveRoutes(
  app: FastifyInstance,
  deps: MeetingArchiveDeps,
): void {
  /**
   * Cifrato o in chiaro si legge; illeggibile lo dice invece di fingere —
   * stessa regola di `archive.ts` e `memoryBook.ts`.
   */
  const readable = (value: string): string => {
    if (deps.dataKey === undefined) {
      return value.startsWith("v1:") ? "[la casa non ha una chiave]" : value;
    }
    try {
      return decryptText(value, deps.dataKey);
    } catch {
      return value.startsWith("v1:") ? "[non leggibile con la chiave di questa casa]" : value;
    }
  };

  app.get("/v1/meetings", { preHandler: deps.guard }, async (request, reply) => {
    const rows = await inAccount(deps.db, request, reply, {}, (db, accountId) =>
      db
        .select({
        id: meetings.id,
        platform: meetings.platform,
        title: meetings.title,
        startedAt: meetings.startedAt,
        endedAt: meetings.endedAt,
        status: meetings.status,
        // chi ci è andato: senza, l'elenco del pannello non poteva dirlo
        who: gosini.name,
      })
        .from(meetings)
        .leftJoin(gosini, eq(meetings.gosinoId, gosini.id))
        .where(inArray(meetings.gosinoId, exemplarsOf(db, accountId)))
        .orderBy(desc(meetings.startedAt))
        .limit(RECENT_LIMIT),
    );
    if (rows === undefined) return reply;
    return reply.send({ meetings: rows });
  });

  /**
   * La trascrizione di una riunione, in chiaro per chi ha diritto di leggerla.
   *
   * `GET /v1/meetings` diceva che una riunione era stata trascritta e non
   * lasciava rileggerla: le righe si aprivano soltanto dentro l'export, cioè
   * scaricando tutta la casa. Sapere che una cosa esiste e non poterla
   * guardare è la stessa cosa che non averla.
   */
  app.get("/v1/meetings/:id/transcript", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const [meeting] = await db
          .select({ id: meetings.id, title: meetings.title })
          .from(meetings)
          .where(and(eq(meetings.id, id), inArray(meetings.gosinoId, exemplarsOf(db, accountId))));
        if (meeting === undefined) return "missing" as const;
        const segments = await db
          .select({
            t0: transcriptSegments.t0,
            t1: transcriptSegments.t1,
            speaker: transcriptSegments.speaker,
            beingId: transcriptSegments.beingId,
            text: transcriptSegments.text,
          })
          .from(transcriptSegments)
          .where(
            and(eq(transcriptSegments.meetingId, id), eq(transcriptSegments.accountId, accountId)),
          )
          .orderBy(transcriptSegments.t0);
        return { meeting, segments };
      },
    );
    if (found === undefined) return reply;
    if (found === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.send({
      meeting: found.meeting,
      segments: found.segments.map((segment) => ({ ...segment, text: readable(segment.text) })),
    });
  });

  /**
   * Buttare una riunione — e qui si cancella davvero, segmenti compresi.
   *
   * La ragione per cui questa porta esiste è la stessa per cui è distruttiva:
   * una riunione registrata per sbaglio contiene le parole di persone che non
   * hanno chiesto niente a nessuno. Un ritiro logico l'avrebbe tenuta sul
   * disco fingendo il contrario — che è ciò che un ricordo può permettersi
   * (è biografia di UGO) e una trascrizione no (è di chi ha parlato).
   */
  app.delete("/v1/meetings/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const gone = await db
          .delete(meetings)
          .where(and(eq(meetings.id, id), inArray(meetings.gosinoId, exemplarsOf(db, accountId))))
          .returning({ id: meetings.id });
        const row = gone[0];
        if (row === undefined) return "missing" as const;
        await deps.audit.record(
          {
            verb: "meeting_deleted",
            outcome: "ok",
            accountId,
            resourceType: "meeting",
            resourceId: row.id,
          },
          db,
        );
        return row;
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.send({ id: done.id, deleted: true });
  });
}
