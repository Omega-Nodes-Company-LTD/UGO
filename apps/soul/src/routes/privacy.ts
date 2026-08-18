import { withAccount, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dataSummary } from "../services/privacy/dataSummary.js";
import type { ExportService } from "../services/privacy/exportService.js";
import { BeingNotFoundError, type ForgetService } from "../services/privacy/forgetService.js";
import type { AuditLogger } from "../services/auditLog.js";
import type { PreHandler } from "./guard.js";
import { accountScope, inAccount } from "./scope.js";

/**
 * Data-subject rights over HTTP (PROGETTO §7). Always behind the guard, and
 * since ADR-019 phase 2 always about **one house**: exporting or erasing is
 * exactly where "the whole database" was the wrong default.
 */

const forgetRequestSchema = z.object({
  beingId: z.uuid(),
  /** erasure is irreversible: the caller must say so explicitly */
  confirm: z.literal(true),
});

export interface PrivacyRouteDeps {
  db: DbClient;
  /**
   * ADR-062: fabbriche sulla transazione, non istanze sul db nudo — l'oblio
   * e l'export sono ESATTAMENTE i due posti dove una query fuori scope
   * sarebbe una casa intera sbagliata.
   */
  forget: (db: DbClient) => ForgetService;
  exporter: (db: DbClient) => ExportService;
  guard: PreHandler;
  /** ADR-049: i due atti che un audit log esiste per registrare */
  audit?: AuditLogger;
}

/**
 * «Cosa sai di me» (ADR-090) — registrata **da sola**, e non insieme ai due
 * atti.
 *
 * I diritti di cancellazione e portabilità hanno bisogno dei loro servizi;
 * questa ha bisogno solo del database. Tenerla dentro lo stesso blocco voleva
 * dire che un'installazione senza quei servizi non poteva nemmeno **dire cosa
 * tiene** — e sapere cosa un sistema sa di te è il gradino prima di ogni
 * diritto, quindi è la cosa che deve mancare per ultima.
 */
export function registerDataSummaryRoute(
  app: FastifyInstance,
  deps: { db: DbClient; guard: PreHandler },
): void {
  /**
   * «Cosa sai di me» (ADR-090).
   *
   * Numeri, non contenuti, e **non** dietro `requireAdmin`: sapere quanto un
   * sistema tiene su di te è il gradino prima di ogni diritto, e metterlo
   * dietro al token di casa vorrebbe dire che per sapere cosa sa di te devi
   * chiedere a qualcun altro. I due atti che seguono restano dove sono.
   */
  app.get("/v1/privacy/summary", { preHandler: deps.guard }, async (request, reply) => {
    const summary = await inAccount(deps.db, request, reply, {}, (db, accountId) =>
      dataSummary(db, accountId),
    );
    if (summary === undefined) return reply;
    return reply.send(summary);
  });
}

export function registerPrivacyRoutes(app: FastifyInstance, deps: PrivacyRouteDeps): void {
  app.post("/v1/privacy/forget", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = forgetRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).type("application/problem+json").send({
        type: "about:blank",
        title: "Invalid erasure request",
        status: 400,
        detail: z.prettifyError(parsed.error),
      });
    }
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    // registrato **prima** dell'esito e poi corretto: una cancellazione che
    // va a meta' e solleva e' precisamente il caso che si vuole poter
    // ricostruire, e un audit scritto solo in caso di successo non lo copre
    const trail = {
      verb: "forget",
      accountId,
      actor: request.tenant,
      resourceType: "being",
      resourceId: parsed.data.beingId,
    } as const;
    try {
      // ADR-062: l'intero oblio in UNA transazione che dichiara la casa — se
      // un passo muore a metà, il rollback lascia la biografia intera invece
      // di mezza redazione
      const report = await withAccount(deps.db, accountId, (db) =>
        deps.forget(db).forgetBeing(parsed.data.beingId, accountId),
      );
      await deps.audit?.record({ ...trail, outcome: "ok" });
      return await reply.send(report);
    } catch (error) {
      if (error instanceof BeingNotFoundError) {
        await deps.audit?.record({ ...trail, outcome: "denied" });
        return reply
          .code(404)
          .type("application/problem+json")
          .send({ type: "about:blank", title: "Being not found", status: 404 });
      }
      await deps.audit?.record({ ...trail, outcome: "error" });
      throw error;
    }
  });

  app.get("/v1/privacy/export", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    const bundle = await withAccount(deps.db, accountId, (db) =>
      deps.exporter(db).exportAll(accountId),
    );
    // l'intera casa in chiaro esce dal server: se una riga sola merita di
    // durare dodici mesi, e' questa
    await deps.audit?.record({
      verb: "export",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "account",
      resourceId: accountId,
    });
    return reply
      .header("content-disposition", 'attachment; filename="ugo-export.json"')
      .send(bundle);
  });
}
