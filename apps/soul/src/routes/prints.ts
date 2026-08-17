import { unknownPrints, UNKNOWN_PRINT_RETENTION_DAYS, type DbClient } from "@ugo/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import { openVoiceAsk } from "../services/voiceEnrolment.js";
import type { PreHandler } from "./guard.js";
import { eldestExemplarOf, inHousehold } from "./scope.js";

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
 *
 * ADR-062: queste rotte sono la **prima superficie convertita** a
 * `inHousehold` — ogni lavoro di database gira dentro la transazione che ha
 * dichiarato la casa, che è l'unica cosa che le politiche RLS leggono. Il
 * `where household_id` resta: RLS è la rete sotto il funambolo, non il
 * funambolo. Le chiamate esterne (il riconoscitore) restano fuori dalla
 * transazione: una connessione tenuta aperta attraverso una HTTP è il costo
 * che ADR-062 §1 rifiuta.
 *
 * E una regola che questa superficie ha insegnato: **la risposta parte DOPO
 * il COMMIT, mai dentro la transazione.** Un `reply.send` nel callback esce
 * prima che `withHousehold` committi: chi agisce sul 200 da un'altra
 * connessione — il pannello che ricarica la lista, la CI che interroga il
 * giornale — può leggere lo stato di prima. E se il COMMIT poi fallisse, il
 * 200 sarebbe una bugia. Visto due volte in CI come «flake» di rlsRoutes
 * (2026-08-17) prima di capire che flake non era: il callback RITORNA il
 * risultato, la rotta risponde quando la transazione è chiusa.
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
    const rows = await inHousehold(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, householdId) =>
        db
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
          .orderBy(desc(unknownPrints.lastSeenAt)),
    );
    if (rows === undefined) return reply;
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
    // primo tratto in casa: l'impronta è davvero mia? Poi si esce per parlare
    // col riconoscitore — la transazione non attraversa mai una chiamata HTTP
    const scoped = await inHousehold(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, householdId) => {
        const [mine] = await db
          .select({ id: unknownPrints.id })
          .from(unknownPrints)
          .where(and(eq(unknownPrints.id, id), eq(unknownPrints.householdId, householdId)));
        return { householdId, mine: mine !== undefined, gosinoId: await eldestExemplarOf(db, householdId) };
      },
    );
    if (scoped === undefined) return reply;
    const recognition = deps.recognition?.(scoped.householdId);
    if (recognition === undefined) {
      problem(reply, 503, "Recognition unavailable", "il servizio di percezione non è configurato");
      return reply;
    }
    if (!scoped.mine) {
      problem(reply, 404, "Print not found");
      return reply;
    }

    const outcome = await recognition.claimPrint({
      printId: id,
      beingId: parsed.data.beingId,
      gosinoId: scoped.gosinoId,
    });
    // secondo tratto in casa: il giornale, e l'apertura della voce.
    // ADR-049: chi ha insegnato quale volto è esattamente il genere di atto
    // che un giornale deve poter mostrare. Id e verbi, mai il vettore.
    const ask = await inHousehold(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, householdId) => {
        await deps.audit.record(
          {
            verb: "face_claimed",
            outcome: outcome === "learned" ? "ok" : "denied",
            householdId,
            resourceType: "print",
            resourceId: id,
          },
          db,
        );
        if (outcome !== "learned") return undefined;
        // ADR-057, la seconda metà: il volto è imparato, e nell'occasione UGO
        // chiede anche la voce — desiderio + finestra aperta + invito sul
        // chiosco. Minore, opt-out audio o profilo già esistente: non si apre
        // niente e il claim resta solo un claim.
        return openVoiceAsk(db, { householdId, beingId: parsed.data.beingId });
      },
    );
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
    if (ask !== undefined) deps.faces?.(scoped.householdId).askVoice(parsed.data.beingId, ask.name);
    return reply.send({ learned: true, voiceAsked: ask !== undefined });
  });

  /** Cancellarne una. Il gesto che rende vera tutta la pagina. */
  app.delete("/v1/prints/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const destroyed = await inHousehold(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, householdId) => {
        const gone = await db
          .delete(unknownPrints)
          .where(and(eq(unknownPrints.id, id), eq(unknownPrints.householdId, householdId)))
          .returning({ id: unknownPrints.id });
        if (gone.length === 0) return 0;
        await deps.audit.record(
          {
            verb: "print_destroyed",
            outcome: "ok",
            householdId,
            resourceType: "print",
            resourceId: id,
          },
          db,
        );
        return gone.length;
      },
    );
    if (destroyed === undefined) return reply;
    if (destroyed === 0) {
      problem(reply, 404, "Print not found");
      return reply;
    }
    return reply.send({ destroyed });
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
    const destroyed = await inHousehold(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, householdId) => {
        const gone = await db
          .delete(unknownPrints)
          .where(
            and(
              eq(unknownPrints.householdId, householdId),
              sql`${unknownPrints.lastSeenAt} < now() - make_interval(days => ${UNKNOWN_PRINT_RETENTION_DAYS})`,
            ),
          )
          .returning({ id: unknownPrints.id });
        if (gone.length > 0) {
          await deps.audit.record(
            {
              verb: "prints_expired",
              outcome: "ok",
              householdId,
              resourceType: "print",
              resourceId: String(gone.length),
            },
            db,
          );
        }
        return gone.length;
      },
    );
    if (destroyed === undefined) return reply;
    return reply.send({ destroyed, retentionDays: UNKNOWN_PRINT_RETENTION_DAYS });
  });
}
