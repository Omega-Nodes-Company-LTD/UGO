import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerDebugChatRoute } from "./routes/debugChat.js";
import { registerFaceWs } from "./routes/faceWs.js";
import { registerHealthRoute, type HealthDeps } from "./routes/health.js";
import { registerV1Routes, type V1Deps } from "./routes/v1.js";
import type { FaceGateway } from "./services/faceGateway.js";

export interface ServerOptions extends HealthDeps {
  logger?: boolean;
  /** v1 feature surface; omitted only by infra-focused tests */
  features?: Omit<V1Deps, "db"> & { face?: FaceGateway };
}

/**
 * Composition root for the HTTP/WS surface. Dependencies are injected so
 * tests wire real ephemeral infrastructure (Testcontainers) instead of mocks.
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  // No PII and no payload contents in logs (CLAUDE.md rule 6): IDs only.
  const serverOptions: FastifyServerOptions = {
    logger:
      options.logger === false ? false : { redact: ["req.headers.authorization", "req.headers.cookie"] },
  };
  const app = Fastify(serverOptions);
  registerHealthRoute(app, options);
  if (options.features !== undefined) {
    const { face, ...v1 } = options.features;
    registerV1Routes(app, { db: options.db, ...v1 });
    registerDebugChatRoute(app);
    if (face !== undefined) {
      app.register(async (instance) => {
        await registerFaceWs(instance, face);
      });
    }
  }
  return app;
}
