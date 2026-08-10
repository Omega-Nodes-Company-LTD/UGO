import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerAudioRoutes, type AudioStorageConfig } from "./routes/audio.js";
import { createAuthGuard } from "./routes/guard.js";
import { registerJobsRoutes } from "./routes/jobs.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { registerDebugChatRoute } from "./routes/debugChat.js";
import { registerFaceWs } from "./routes/faceWs.js";
import { registerHealthRoute, type HealthDeps } from "./routes/health.js";
import { registerMeetingsRoutes } from "./routes/meetings.js";
import { registerV1Routes, type V1Deps } from "./routes/v1.js";
import type { FaceGateway } from "./services/faceGateway.js";
import type { MeetingsService } from "./services/meetingsService.js";
import type { ExportService } from "./services/privacy/exportService.js";
import type { ForgetService } from "./services/privacy/forgetService.js";

export interface ServerOptions extends HealthDeps {
  logger?: boolean;
  /** v1 feature surface; omitted only by infra-focused tests */
  features?: Omit<V1Deps, "db"> & {
    face?: FaceGateway;
    audio?: AudioStorageConfig;
    meetings?: MeetingsService;
    privacy?: { forget: ForgetService; exporter: ExportService };
    /** bearer token protecting destructive/expensive routes */
    internalToken?: string;
    dreamTriggerUrl?: string;
  };
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
  // the face app is served from a different origin (kiosk/vite) on the same
  // tailnet; no cookies or credentials are involved, so a permissive CORS is
  // the correct posture for this single-user, never-public service (ADR-007)
  app.register(cors, { origin: true });
  registerHealthRoute(app, options);
  if (options.features !== undefined) {
    const { face, audio, meetings, privacy, internalToken, dreamTriggerUrl, ...v1 } =
      options.features;
    const guard = createAuthGuard(internalToken);
    registerV1Routes(app, { db: options.db, ...v1 });
    registerDebugChatRoute(app);
    registerJobsRoutes(app, {
      db: options.db,
      guard,
      ...(dreamTriggerUrl !== undefined && { dreamTriggerUrl }),
    });
    if (audio !== undefined) {
      registerAudioRoutes(app, audio, guard);
    }
    if (meetings !== undefined) {
      registerMeetingsRoutes(app, meetings, guard);
    }
    if (privacy !== undefined) {
      registerPrivacyRoutes(app, { ...privacy, guard });
    }
    if (face !== undefined) {
      app.register(async (instance) => {
        await registerFaceWs(instance, face);
      });
    }
  }
  return app;
}
