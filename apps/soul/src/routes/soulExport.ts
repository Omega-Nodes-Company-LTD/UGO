import { once } from "node:events";
import { PassThrough } from "node:stream";
import { gosini, withAccount, type DbClient } from "@ugo/db";
import { generateRecoveryCode } from "@ugo/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import type { ExportRequest, ExportSummary } from "../services/soulExport/exportSoul.js";
import { ExportRefusal } from "../services/soulExport/exportSoul.js";
import { archiveFileName, ExportLimiter, nameMatches } from "../services/soulExport/guards.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * «A casa tua» — porta fuori l'anima (ADR-132, MKT-10.4).
 *
 * Due rotte, e solo per chi amministra la casa:
 *  - `GET  /v1/privacy/soul-export/options` — quali creature si possono portare;
 *  - `POST /v1/privacy/soul-export`         — l'archivio, in streaming.
 *
 * Tre cose che qui contano più del codice:
 *
 * 1. **Si rifiuta prima del primo byte.** Il download parte solo quando
 *    l'esportazione ha già superato i controlli (creatura viva e della casa,
 *    piano valido): da quel momento in poi un errore taglia il file, e un file
 *    tagliato non si apre mai (il lettore lo rifiuta). Mai un archivio
 *    «quasi valido».
 * 2. **La frase di recupero esce una volta sola**, nell'intestazione
 *    `x-ugo-recovery-code`, e non entra in nessun log né nell'audit: il
 *    giornale registra l'atto e la creatura (un id), mai la frase.
 * 3. **È un po' difficile da chiedere, apposta**: si scrive il nome della
 *    creatura, e una casa ne può avviare pochi all'ora, uno alla volta.
 */

const bodySchema = z.object({
  gosinoId: z.uuid(),
  mode: z.enum(["trasloco", "copia"]).default("trasloco"),
  /** il nome della creatura, scritto da chi chiede (stesso patto del congedo) */
  confirmName: z.string().min(1).max(200),
  /** facoltativa: se manca se ne genera una (24 caratteri, da scrivere su carta) */
  passphrase: z.string().min(12).max(200).optional(),
});

export type SoulExportRun = (
  request: ExportRequest,
  sink: (chunk: Buffer) => Promise<void>,
) => Promise<ExportSummary>;

export interface SoulExportRouteDeps {
  db: DbClient;
  guard: PreHandler;
  run: SoulExportRun;
  audit?: AuditLogger;
  limiter?: ExportLimiter;
}

function problem(reply: FastifyReply, status: number, title: string, detail?: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

/** Writes with backpressure, and gives up if the client has gone: never wait on a dead stream. */
async function writeOrGiveUp(out: PassThrough, chunk: Buffer): Promise<void> {
  if (out.destroyed) throw new Error("the client went away");
  if (out.write(chunk)) return;
  await Promise.race([
    once(out, "drain"),
    once(out, "close").then(() => {
      throw new Error("the client went away");
    }),
  ]);
}

export function registerSoulExportRoutes(app: FastifyInstance, deps: SoulExportRouteDeps): void {
  const limiter = deps.limiter ?? new ExportLimiter({ perWindow: 3, windowMs: 3_600_000 });

  app.get("/v1/privacy/soul-export/options", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    const creatures = await withAccount(deps.db, accountId, (db) =>
      db
        .select({ id: gosini.id, name: gosini.name })
        .from(gosini)
        .where(and(eq(gosini.accountId, accountId), isNull(gosini.retiredAt))),
    );
    return reply.send({ creatures, perHour: 3 });
  });

  app.post("/v1/privacy/soul-export", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return problem(reply, 400, "Invalid soul export request", z.prettifyError(parsed.error));
    }
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    const { gosinoId, mode, confirmName, passphrase } = parsed.data;
    const trail = {
      verb: "soul_export",
      accountId,
      actor: request.tenant,
      resourceType: "gosino",
      resourceId: gosinoId,
    } as const;

    const [creature] = await withAccount(deps.db, accountId, (db) =>
      db
        .select({ name: gosini.name, retiredAt: gosini.retiredAt })
        .from(gosini)
        .where(and(eq(gosini.accountId, accountId), eq(gosini.id, gosinoId))),
    );
    // not there, not yours, or gone: one answer, so probing teaches nothing (BOLA)
    const alive = creature?.retiredAt === null ? creature : undefined;
    if (alive === undefined) {
      await deps.audit?.record({ ...trail, outcome: "denied" });
      return problem(reply, 404, "Creature not found");
    }
    if (!nameMatches(confirmName, alive.name)) {
      await deps.audit?.record({ ...trail, outcome: "denied" });
      return problem(reply, 422, "Confirmation does not match", "type the creature's name to confirm");
    }
    const verdict = limiter.tryStart(accountId);
    if (verdict !== "ok") {
      await deps.audit?.record({ ...trail, outcome: "denied" });
      if (verdict === "rate") reply.header("retry-after", String(limiter.retryAfterSeconds(accountId)));
      return problem(
        reply,
        429,
        verdict === "busy" ? "An export is already running" : "Too many exports",
        verdict === "busy" ? "wait for the running export to finish" : "try again later",
      );
    }

    const secret = passphrase ?? generateRecoveryCode();
    const out = new PassThrough();
    let announced = false;
    const ready = new Promise<void>((resolve, reject) => {
      const sink = async (chunk: Buffer): Promise<void> => {
        if (!announced) {
          announced = true;
          resolve();
        }
        await writeOrGiveUp(out, chunk);
      };
      void deps.run({ accountId, gosinoIds: [gosinoId], mode, secret }, sink).then(
        async () => {
          limiter.finish(accountId);
          // the act is on record BEFORE the last byte goes out: a response that
          // can complete ahead of its own audit row is a race, not a trail
          await deps.audit?.record({ ...trail, outcome: "ok" });
          out.end();
        },
        async (error: unknown) => {
          limiter.finish(accountId);
          await deps.audit?.record({
            ...trail,
            outcome: error instanceof ExportRefusal ? "denied" : "error",
          });
          if (announced) out.destroy(error instanceof Error ? error : undefined); // a cut file never opens
          else reject(error instanceof Error ? error : new Error("export failed"));
        },
      );
    });

    try {
      await ready;
    } catch (error) {
      if (error instanceof ExportRefusal) return problem(reply, 404, "Creature not found");
      request.log.error({ err: error instanceof Error ? error.name : "unknown" }, "soul export failed");
      return problem(reply, 500, "The export could not be built", "nothing was written; see the server log");
    }
    // the client may have vanished while we were planning: do not strand the export
    reply.raw.once("close", () => {
      if (!out.writableEnded) out.destroy();
    });
    reply
      .header("content-type", "application/octet-stream")
      .header("content-disposition", `attachment; filename="${archiveFileName(alive.name, new Date())}"`)
      .header("cache-control", "no-store")
      .header("access-control-expose-headers", "x-ugo-recovery-code, content-disposition");
    if (passphrase === undefined) reply.header("x-ugo-recovery-code", secret);
    return reply.send(out);
  });
}
