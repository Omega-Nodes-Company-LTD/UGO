import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerHealthRoute, type HealthDeps } from "./routes/health.js";

export interface ServerOptions extends HealthDeps {
  logger?: boolean;
}

/**
 * Composition root for the HTTP surface. Dependencies are injected so tests
 * wire real ephemeral infrastructure (Testcontainers) instead of mocks.
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  // No PII and no payload contents in logs (CLAUDE.md rule 6): IDs only.
  const serverOptions: FastifyServerOptions = {
    logger:
      options.logger === false ? false : { redact: ["req.headers.authorization", "req.headers.cookie"] },
  };
  const app = Fastify(serverOptions);
  registerHealthRoute(app, options);
  return app;
}
