import { unknownPrints, UNKNOWN_PRINT_RETENTION_DAYS, type DbClient } from "@ugo/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import { openVoiceAsk } from "../services/voiceEnrolment.js";
import type { PreHandler } from "./guard.js";
import { eldestExemplarOf, householdScope } from "./scope.js";

/**
 * Le facce che non sappiamo di chi siano (ADR-057).
 *
 * Il proprietario non vuole un modulo di arruolamento nel pannello — il volto
 * glielo insegni **perché te lo chiede lui**, a voce, quando ti rivede. Ma la
 * *revisione* sì, e non è un dettaglio di comodità: qui dentro ci sono dati
 * biometrici di persone che non hanno acconsentito, e chi tiene quei dati deve
 * poter vedere quali sono e cancellarne uno col dito.
 *
 * Cosa **non** esce da qui: mai l'impronta. La lista dice quante volte, quando,
 * e con quale modello — non restituisce mai il vettore, che resta cifrato nel
 * database e in chiaro solo dentro il servizio Python. Un pannello che
 * scaricasse embedding sarebbe un modo per farli uscire di casa.
 */

const claimSchema = z.object({ beingId: z.uuid() });

export interface PrintRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  audit: AuditLogger;
  /** il servizio di percezione, per casa: è lui che tiene gli encoder */
  recognition?: (householdId: string) => {
    claimPrint: (input: {
      printId: string;
      beingId: string;
      gosinoId: string;
    }) => Promise<"learned" | "refused" | "unreachable">;
  };
  /**
   * ADR-057, la seconda metà: i corpi della casa, per l'invito «fatti sentire
   * la voce» che parte quando il volto è appena stato imparato. Facoltativa —
   * senza registro il claim funziona uguale, solo senza invito sul chiosco.
   */
  faces?: (householdId: string) => { askVoice: (beingId: string, name: string) => void };
}

function problem(reply: FastifyReply, status: number, title: string, detail?: string): void {
  void reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerPrintRoutes(app: FastifyInstance, deps: PrintRoutesDeps): void {
  app.get("/v1/prints/unknown", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const rows = await deps.db
      .select({
        id: unknownPrints.id,
        modality: unknownPrints.modality,
        model: unknownPrints.model,
        seenCount: unknownPrints.seenCount,
        firstSeenAt: unknownPrints.firstSeenAt,
        lastSeenAt: unknownPrints.lastSeenAt,
        askedAt: unknownPrints.askedAt,
      })
      .from(unknownPrints)
      .where(eq(unknownPrints.householdId, householdId))
      .orderBy(desc(unknownPrints.lastSeenAt));
    return reply.send({ prints: rows, retentionDays: UNKNOWN_PRINT_RETENTION_DAYS });
  });

  /** «Quello è Marco.» Da qui in poi quella faccia ha un nome. */
  app.post("/v1/prints/:id/claim", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = claimSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid request", z.prettifyError(parsed.error));
      return reply;
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const recognition = deps.recognition?.(householdId);
    if (recognition === undefined) {
      problem(reply, 503, "Recognition unavailable", "il servizio di percezione non è configurato");
      return reply;
    }
    const [mine] = await deps.db
      .select({ id: unknownPrints.id })
      .from(unknownPrints)
      .where(and(eq(unknownPrints.id, id), eq(unknownPrints.householdId, householdId)));
    if (mine === undefined) {
      problem(reply, 404, "Print not found");
      return reply;
    }

    const outcome = await recognition.claimPrint({
      printId: id,
      beingId: parsed.data.beingId,
      gosinoId: await eldestExemplarOf(deps.db, householdId),
    });
    // ADR-049: chi ha insegnato quale volto è esattamente il genere di atto che
    // un giornale deve poter mostrare. Id e verbi, mai il vettore.
    await deps.audit.record({
      verb: "face_claimed",
      outcome: outcome === "learned" ? "ok" : "denied",
      householdId,
      resourceType: "print",
      resourceId: id,
    });
    if (outcome === "refused") {
      // non è un guasto: è `no_vision` o `is_minor` che fanno il loro lavoro, e
      // l'impronta è stata distrutta lo stesso
      problem(
        reply,
        403,
        "Biometric enrollment refused",
        "per questa persona hai chiesto di non usare la camera, oppure è un minore. " +
          "L'impronta è stata cancellata.",
      );
      return reply;
    }
    if (outcome === "unreachable") {
      problem(reply, 502, "Recognition unavailable");
      return reply;
    }
    // ADR-057, la seconda metà: il volto è imparato, e nell'occasione UGO
    // chiede anche la voce — desiderio + finestra aperta + invito sul chiosco.
    // Se la persona è minore, ha l'opt-out audio o ha già un profilo vocale,
    // `openVoiceAsk` non apre niente e il claim resta solo un claim.
    const ask = await openVoiceAsk(deps.db, { householdId, beingId: parsed.data.beingId });
    if (ask !== undefined) deps.faces?.(householdId).askVoice(parsed.data.beingId, ask.name);
    return reply.send({ learned: true, voiceAsked: ask !== undefined });
  });

  /** Cancellarne una. Il gesto che rende vera tutta la pagina. */
  app.delete("/v1/prints/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const gone = await deps.db
      .delete(unknownPrints)
      .where(and(eq(unknownPrints.id, id), eq(unknownPrints.householdId, householdId)))
      .returning({ id: unknownPrints.id });
    if (gone.length === 0) {
      problem(reply, 404, "Print not found");
      return reply;
    }
    await deps.audit.record({
      verb: "print_destroyed",
      outcome: "ok",
      householdId,
      resourceType: "print",
      resourceId: id,
    });
    return reply.send({ destroyed: gone.length });
  });

  /**
   * La scadenza, applicata.
   *
   * Una retention dichiarata e non applicata è peggio di nessuna retention:
   * promette una cosa che non succede. Sta su una rotta perché i job notturni
   * di questa casa girano così (`/v1/jobs/*`), e girarla a mano è anche il modo
   * in cui la si dimostra.
   */
  app.post("/v1/prints/expire", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const gone = await deps.db
      .delete(unknownPrints)
      .where(
        and(
          eq(unknownPrints.householdId, householdId),
          sql`${unknownPrints.lastSeenAt} < now() - make_interval(days => ${UNKNOWN_PRINT_RETENTION_DAYS})`,
        ),
      )
      .returning({ id: unknownPrints.id });
    if (gone.length > 0) {
      await deps.audit.record({
        verb: "prints_expired",
        outcome: "ok",
        householdId,
        resourceType: "print",
        resourceId: String(gone.length),
      });
    }
    return reply.send({ destroyed: gone.length, retentionDays: UNKNOWN_PRINT_RETENTION_DAYS });
  });
}
