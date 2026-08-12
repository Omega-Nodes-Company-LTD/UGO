import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerAudioRoutes, type AudioStorageConfig } from "./routes/audio.js";
import { createAuthGuard, registerTenantResolution } from "./routes/guard.js";
import { registerJobsRoutes } from "./routes/jobs.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
import { registerArchiveRoutes } from "./routes/archive.js";
import { registerMemoryGraphRoutes } from "./routes/memoryGraph.js";
import { registerPackRoutes } from "./routes/pack/index.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { registerStatsRoute } from "./routes/stats.js";
import { registerDebugChatRoute } from "./routes/debugChat.js";
import { registerFaceStatic } from "./routes/faceStatic.js";
import { registerFaceWs } from "./routes/faceWs.js";
import { registerCouncilRoutes } from "./routes/council.js";
import { registerGosiniRoutes } from "./routes/gosini.js";
import type { CouncilService } from "./services/council/councilService.js";
import type { GosinoRegistry } from "./services/pack/runtimes.js";
import { registerHealthRoute, type HealthDeps } from "./routes/health.js";
import { registerMeetingsRoutes } from "./routes/meetings.js";
import { registerV1Routes, type V1Deps } from "./routes/v1.js";
import { registerVolitionRoutes } from "./routes/volition.js";
import type { InitiativeSwitch } from "./services/volition/initiativeSwitch.js";
import type { FaceGateway } from "./services/faceGateway.js";
import type { MeetingsService } from "./services/meetingsService.js";
import type { ExportService } from "./services/privacy/exportService.js";
import type { ForgetService } from "./services/privacy/forgetService.js";
import type { SpeciesMap } from "@ugo/shared";

export interface ServerOptions extends HealthDeps {
  logger?: boolean;
  /** absolute path of the built face bundle; absent in dev, where Vite serves it */
  faceRoot?: string;
  /** v1 feature surface; omitted only by infra-focused tests */
  features?: Omit<V1Deps, "db"> & {
    face?: FaceGateway;
    audio?: AudioStorageConfig;
    meetings?: MeetingsService;
    privacy?: { forget: ForgetService; exporter: ExportService };
    stats?: { dailyBudgetUsd: number; timezone: string };
    /** the pack surface (ADR-014); the Umwelt map comes from configuration */
    speciesMap?: SpeciesMap;
    /** ADR-031: a way to ask all of them at once. Local models only. */
    council?: { council: CouncilService };
    /**
     * ADR-036: the population — born, listed, moved between rooms. Independent
     * of the council: a house can have several creatures and never convene one.
     */
    gosini?: { householdId: () => Promise<string> };
    /** ADR-032: the per-exemplar runtimes a socket can ask to be */
    registry?: GosinoRegistry;
    /** ADR-034: the runtime override on UGO_INITIATIVE, for /admin */
    initiative?: InitiativeSwitch;
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
  // audio arrives as bytes, not JSON: without this Fastify refuses the body
  // with a 415 before any route sees it
  app.addContentTypeParser(
    ["audio/webm", "audio/ogg", "audio/wav", "application/octet-stream"],
    { parseAs: "buffer" },
    (_request, payload, done) => {
      done(null, payload);
    },
  );
  // health answers before anyone asks who is calling: it must not depend on
  // authentication to say the database is gone
  registerHealthRoute(app, options);
  if (options.features !== undefined) {
    const {
      face,
      audio,
      meetings,
      privacy,
      stats,
      speciesMap,
      council,
      gosini,
      registry,
      initiative,
      internalToken,
      dreamTriggerUrl,
      ...v1
    } = options.features;
    // first, and before every route below it: Fastify binds onRequest hooks to
    // the routes declared after them
    registerTenantResolution(app, {
      db: options.db,
      ...(internalToken !== undefined && { legacyToken: internalToken }),
    });
    const guard = createAuthGuard();
    registerV1Routes(app, {
      db: options.db,
      ...v1,
      ...(registry !== undefined && { registry }),
    });
    if (initiative !== undefined) {
      registerVolitionRoutes(app, {
        db: options.db,
        guard,
        initiative,
        ...(registry !== undefined && { registry }),
      });
    }
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
    // the archive is about memories and meetings, and had no business being
    // gated on the species map: it was registered there only because both
    // arrived in the same afternoon
    registerArchiveRoutes(app, {
      db: options.db,
      chat: v1.chat,
      guard,
      ...(registry !== undefined && { registry }),
    });
    registerMemoryGraphRoutes(app, { db: options.db, guard });
    if (speciesMap !== undefined) {
      registerPackRoutes(app, {
        db: options.db,
        speciesMap,
        guard,
        ...(audio !== undefined && { audio }),
      });
      registerAdminRoutes(app);
    }
    if (gosini !== undefined) {
      registerGosiniRoutes(app, {
        db: options.db,
        guard,
        ...gosini,
        ...(registry !== undefined && { registry }),
      });
    }
    if (council !== undefined) {
      registerCouncilRoutes(app, { db: options.db, guard, ...council });
    }
    if (stats !== undefined) {
      registerStatsRoute(app, {
        db: options.db,
        ...stats,
        guard,
        ...(registry !== undefined && { registry }),
      });
    }
    if (face !== undefined) {
      app.register(async (instance) => {
        await registerFaceWs(instance, face, registry);
      });
    }
  }
  // last: the static bundle must never shadow an API route
  if (options.faceRoot !== undefined) {
    registerFaceStatic(app, options.faceRoot);
  }
  return app;
}
