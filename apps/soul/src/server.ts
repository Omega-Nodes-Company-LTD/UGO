import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerAudioRoutes, type AudioStorageConfig } from "./routes/audio.js";
import { createAuditLog } from "./services/auditLog.js";
import { createAuthGuard, registerTenantResolution } from "./routes/guard.js";
import { registerHouseholdRoutes } from "./routes/households.js";
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
import { registerCustomersRoutes } from "./routes/customers.js";
import { registerCustomerSourcesRoutes } from "./routes/customerSources.js";
import { registerPrintRoutes } from "./routes/prints.js";
import { registerFeedRoutes } from "./routes/feeds.js";
import { registerPropRoutes } from "./routes/props.js";
import { registerReceptionRoutes } from "./routes/reception.js";
import { AnswerCache } from "./services/reception/answerCache.js";
import { CustomerChatService, type HouseClock } from "./services/reception/customerChatService.js";
import type { CustomerQuota } from "./services/reception/customerQuota.js";
import { CustomerRewardService } from "./services/reception/customerReward.js";
import type { GithubLiveService } from "./services/reception/githubLiveService.js";
import type { EmbeddingsClient, LlmClient } from "@ugo/memory";
import { registerV1Routes, type V1Deps } from "./routes/v1.js";
import { PropService } from "./services/propService.js";
import { SceneHub } from "./services/sceneHub.js";
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
     * ADR-019 phase 2 removed its `householdId` dependency: which house a birth
     * belongs to is a property of the request, not of the process.
     */
    gosini?: Record<string, never>;
    /** ADR-032: the per-exemplar runtimes a socket can ask to be */
    registry?: GosinoRegistry;
    /** ADR-034: the runtime override on UGO_INITIATIVE, for /admin */
    initiative?: InitiativeSwitch;
    /** bearer token protecting destructive/expensive routes */
    internalToken?: string;
    dreamTriggerUrl?: string;
    /**
     * ADR-051: the reception's door. Registered only when the dedicated
     * service secret is configured — no secret, no public-facing surface.
     * The chat service is built HERE so it shares the one audit logger.
     */
    reception?: {
      token: string;
      dataKey: Buffer;
      quota: CustomerQuota;
      llmFor: (householdId: string, gosinoId: string, clock?: HouseClock) => LlmClient;
      /** ADR-054: retrieval over the knowledge index */
      embedder?: EmbeddingsClient;
      /** ADR-054: live PRs/commits on live-state questions */
      github?: GithubLiveService;
      /** ADR-058: UGO_CUSTOMER_WEEKLY_REWARDS — il muro della mela */
      weeklyRewards: number;
    };
    /** ADR-052: the house side — customers CRUD, assignment, tokens, triage */
    customers?: {
      dataKey: Buffer;
      /** ADR-054: the private docs bucket; absent = uploads answer 503 */
      docsStorage?: AudioStorageConfig;
      /** optional HTTP trigger of the jobs runner for an out-of-band sync */
      syncTriggerUrl?: string;
    };
    /**
     * ADR-057: chi rivendica un'impronta ignota, per casa.
     *
     * Una funzione della casa e non un'istanza sola, per la stessa ragione di
     * `recognition` in `RuntimeDeps`: i profili biometrici sono per casa, e un
     * riconoscitore costruito una volta confronterebbe il volto di una famiglia
     * coi centroidi di un'altra.
     */
    prints?: (householdId: string) => {
      claimPrint: (input: {
        printId: string;
        beingId: string;
        gosinoId: string;
      }) => Promise<"learned" | "refused" | "unreachable">;
    };
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
      reception,
      customers,
      prints,
      ...v1
    } = options.features;
    // first, and before every route below it: Fastify binds onRequest hooks to
    // the routes declared after them
    registerTenantResolution(app, {
      db: options.db,
      ...(internalToken !== undefined && { legacyToken: internalToken }),
    });
    // ADR-049: uno solo, per la stessa ragione per cui `llmClient` e' uno solo
    const audit = createAuditLog(options.db, app.log);
    // ADR-056: chi guarda quale stanza, adesso. Uno per processo, come l'audit
    const scenes = new SceneHub();
    const props = new PropService(options.db);
    const guard = createAuthGuard(audit);
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
    // il selettore del pannello: aperta al solo token, che e' gia' abbastanza
    // — dice quali case *quel* token puo' vedere, e per quasi tutti e' una
    registerHouseholdRoutes(app, { db: options.db });
    registerJobsRoutes(app, {
      db: options.db,
      guard,
      audit,
      ...(dreamTriggerUrl !== undefined && { dreamTriggerUrl }),
    });
    if (audio !== undefined) {
      registerAudioRoutes(app, audio, guard);
    }
    if (meetings !== undefined) {
      registerMeetingsRoutes(app, meetings, guard);
    }
    if (privacy !== undefined) {
      registerPrivacyRoutes(app, { db: options.db, ...privacy, guard, audit });
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
    // ADR-056: gli arredi. L'hub e' condiviso fra le rotte che li spostano e i
    // socket che li mostrano — e' l'unica cosa che i due hanno in comune, ed e'
    // il motivo per cui il pannello si vede sul chiosco senza ricaricare.
    registerPropRoutes(app, { db: options.db, guard, hub: scenes });
    // ADR-060: i feed della casa — la lista; il download è dei job
    registerFeedRoutes(app, { db: options.db, guard, audit });
    // ADR-057: le facce che non sappiamo di chi siano. Guardata tutta: qui
    // dentro ci sono impronte di persone che non hanno acconsentito.
    registerPrintRoutes(app, {
      db: options.db,
      guard,
      audit,
      ...(prints !== undefined && { recognition: prints }),
      // ADR-057, la seconda metà: il claim del volto manda l'invito «fatti
      // sentire la voce» sui corpi della casa — tutti, perché la persona sta
      // davanti a uno di loro e soul non sa quale
      ...(registry !== undefined && {
        faces: (householdId: string) => ({
          askVoice: (beingId: string, name: string): void => {
            for (const runtime of registry.all(householdId)) {
              runtime.gateway.broadcastAskVoice(beingId, name);
            }
          },
        }),
      }),
    });
    if (speciesMap !== undefined) {
      registerPackRoutes(app, {
        db: options.db,
        speciesMap,
        guard,
        ...(audio !== undefined && { audio }),
        // ADR-058: una correzione è per **una** creatura, e senza il registro
        // non c'è modo di sapere quale
        ...(registry !== undefined && { registry }),
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
    if (customers !== undefined) {
      registerCustomersRoutes(app, {
        db: options.db,
        guard,
        dataKey: customers.dataKey,
        audit,
      });
      registerCustomerSourcesRoutes(app, {
        db: options.db,
        guard,
        dataKey: customers.dataKey,
        audit,
        ...(customers.docsStorage !== undefined && { docsStorage: customers.docsStorage }),
        ...(customers.syncTriggerUrl !== undefined && {
          syncTriggerUrl: customers.syncTriggerUrl,
        }),
      });
    }
    if (reception !== undefined) {
      registerReceptionRoutes(app, {
        db: options.db,
        receptionToken: reception.token,
        // ADR-058: la psiche viva arriva dal registro — la mela di un cliente
        // scalda l'esemplare che sta girando, non una copia
        reward: new CustomerRewardService({
          db: options.db,
          weeklyDefault: reception.weeklyRewards,
          ...(registry !== undefined && {
            psycheFor: (householdId: string, gosinoId: string) =>
              registry.all(householdId).find((runtime) => runtime.id === gosinoId)?.psyche,
          }),
        }),
        chat: new CustomerChatService({
          db: options.db,
          dataKey: reception.dataKey,
          quota: reception.quota,
          llmFor: reception.llmFor,
          audit,
          ...(reception.embedder !== undefined && { embedder: reception.embedder }),
          ...(reception.github !== undefined && { github: reception.github }),
          // ADR-055 wall 3, built here so it shares db and key with the rest
          cache: new AnswerCache(options.db, reception.dataKey, reception.embedder),
        }),
        dataKey: reception.dataKey,
        audit,
        ...(reception.github !== undefined && { github: reception.github }),
      });
    }
    if (face !== undefined) {
      app.register(async (instance) => {
        await registerFaceWs(instance, face, options.db, registry, {
          hub: scenes,
          props: (householdId, room) => props.inRoom(householdId, room),
        });
      });
    }
  }
  // last: the static bundle must never shadow an API route
  if (options.faceRoot !== undefined) {
    registerFaceStatic(app, options.faceRoot);
  }
  return app;
}
