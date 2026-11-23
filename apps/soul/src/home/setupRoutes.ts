import type { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SetupGuard } from "./guard.js";
import { SETUP_CSS, SETUP_HTML, SETUP_JS } from "./setupPage.js";
import { SetupRefusal, type SetupService } from "./setupService.js";

/**
 * Le rotte del `/setup` (ADR-132 §2). Guscio sottile: ogni decisione è in
 * `SetupService`. Due fatti che contano:
 *  - gli errori noti hanno parole già scelte (`SetupRefusal`); tutto il resto
 *    diventa un 500 generico, perché il messaggio di un guasto sconosciuto può
 *    citare un valore;
 *  - ogni risposta porta `cache-control: no-store`, e la pagina una CSP chiusa.
 */
const codeSchema = z.object({ recoveryCode: z.string().min(1).max(200) });
const installSchema = codeSchema.extend({
  openRouterKey: z.string().min(1).max(500),
  dailyBudgetUsd: z.number().min(0.05).max(100),
});
const keySchema = z.object({ openRouterKey: z.string().min(1).max(500) });

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export function registerSetupRoutes(app: FastifyInstance, service: SetupService, guard: SetupGuard): void {
  app.addHook("onSend", (_request, reply, payload, done) => {
    void reply.header("cache-control", "no-store");
    void reply.header("x-content-type-options", "nosniff");
    done(null, payload);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof SetupRefusal) {
      // un codice o una frase sbagliati contano: sono l'unico modo di tentare a caso
      if (error.status === 422) guard.noteFailure();
      void reply.code(error.status).send({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      void reply.code(400).send({ error: "richiesta non valida" });
      return;
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      void reply.code(status).send({ error: "richiesta non valida" });
      return;
    }
    app.log.error({ name: error instanceof Error ? error.name : "unknown" }, "setup failed");
    void reply.code(500).send({ error: "errore inatteso; non è stato scritto nulla" });
  });
  // il corpo dell'archivio arriva com'è: lo legge il servizio, a flusso
  app.addContentTypeParser("application/octet-stream", (_request, payload, done) => {
    done(null, payload);
  });

  const asset = (path: string, type: string, body: string): void => {
    app.get(path, { preHandler: guard.pageGuard }, (_request, reply) => {
      void reply.header("content-type", type).header("content-security-policy", CSP).send(body);
    });
  };
  asset("/setup", "text/html; charset=utf-8", SETUP_HTML);
  asset("/setup/app.js", "text/javascript; charset=utf-8", SETUP_JS);
  asset("/setup/app.css", "text/css; charset=utf-8", SETUP_CSS);

  app.get("/setup/state", { preHandler: guard.apiGuard }, async () => ({ state: await service.state() }));

  app.post("/setup/archive", { preHandler: guard.apiGuard }, async (request) => {
    const body = request.body as Readable | undefined;
    if (body === undefined || typeof body.pipe !== "function") {
      throw new SetupRefusal(415, "il file va inviato come application/octet-stream");
    }
    return service.receive(body);
  });

  app.post("/setup/inspect", { preHandler: guard.apiGuard }, async (request) => {
    const { recoveryCode } = codeSchema.parse(request.body);
    return service.inspect(recoveryCode);
  });

  app.post("/setup/install", { preHandler: guard.apiGuard }, async (request) => {
    const input = installSchema.parse(request.body);
    return service.install({
      recoveryCode: input.recoveryCode,
      openRouterKey: input.openRouterKey,
      dailyBudgetUsd: input.dailyBudgetUsd,
    });
  });

  app.post("/setup/key", { preHandler: guard.apiGuard }, async (request) => {
    const { openRouterKey } = keySchema.parse(request.body);
    await service.saveKey(openRouterKey);
    return { ok: true };
  });
}
