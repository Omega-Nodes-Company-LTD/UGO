import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerAudioRoutes, type AudioStorageConfig } from "./routes/audio.js";
import { createAuditLog } from "./services/auditLog.js";
import { createAuthGuard, registerTenantResolution } from "./routes/guard.js";
import { registerCapabilitiesRoute, type Capability } from "./routes/capabilities.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerJobsRoutes } from "./routes/jobs.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
import { registerArchiveRoutes } from "./routes/archive.js";
import { registerMemoryGraphRoutes } from "./routes/memoryGraph.js";
import { registerPackRoutes } from "./routes/pack/index.js";
import { registerDataSummaryRoute, registerPrivacyRoutes } from "./routes/privacy.js";
import { registerStatsRoute } from "./routes/stats.js";
import { registerDebugChatRoute } from "./routes/debugChat.js";
import { registerFaceStatic } from "./routes/faceStatic.js";
import { registerFaceWs } from "./routes/faceWs.js";
import { registerCouncilRoutes } from "./routes/council.js";
import { registerGosiniRoutes } from "./routes/gosini.js";
import { registerLitterRoutes } from "./routes/litters.js";
import { registerPiggyBankRoutes } from "./routes/piggybank.js";
import { registerDowryRoutes } from "./routes/dowry.js";
import { registerFarewellRoutes } from "./routes/farewell.js";
import { registerCheckinRoutes } from "./routes/checkins.js";
import { registerMemoryBookRoutes } from "./routes/memoryBook.js";
import { registerPackMoodRoutes } from "./routes/packMood.js";
import { registerDiaryRoutes } from "./routes/diary.js";
import { registerTransferRoutes } from "./routes/transfer.js";
import { registerVetrinaRoutes } from "./routes/vetrina.js";
import { registerAdoptionRoutes } from "./routes/adoptions.js";
import { registerListRoutes } from "./routes/lists.js";
import { PeerService } from "./services/peerService.js";
import { RegistryClient } from "./services/registryClient.js";
import type { CouncilService } from "./services/council/councilService.js";
import type { GosinoRegistry } from "./services/pack/runtimes.js";
import { registerHealthRoute, type HealthDeps } from "./routes/health.js";
import { registerMeetingsRoutes } from "./routes/meetings.js";
import { registerCustomersRoutes } from "./routes/customers.js";
import { registerCustomerSourcesRoutes } from "./routes/customerSources.js";
import { registerPrintRoutes } from "./routes/prints.js";
import { registerFeedRoutes } from "./routes/feeds.js";
import { registerMcpRoute, type McpRouteDeps } from "./routes/mcp.js";
import { registerSttRoute, type SttRouteDeps } from "./routes/stt.js";
import { registerTtsRoute, type TtsRouteDeps } from "./routes/tts.js";
import { registerWeatherRoute, type WeatherDeps } from "./routes/weather.js";
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
  /**
   * Quali funzioni facoltative sono accese, e perché le altre no.
   *
   * Valutata a ogni richiesta e non alla costruzione: una variabile aggiunta
   * stanotte si vede stamattina senza riavviare per guardare.
   */
  capabilities?: () => Capability[];
  /**
   * ADR-061: far nascere una casa dal pannello.
   *
   * Iniettata perché serve la chiave madre, che il server non possiede: è la
   * stessa `createAccount` che usa `ugo casa nuova`, e senza di lei la
   * rotta risponde 501 invece di fingere.
   */
  createHouse?: (input: {
    slug: string;
    name: string;
    kind?: "famiglia" | "azienda" | undefined;
    timezone?: string | undefined;
    gosinoName?: string | undefined;
  }) => Promise<{ accountId: string; slug: string; persona: string; ownerToken: string; tokenId: string }>;
  /**
   * v1 feature surface; omitted only by infra-focused tests.
   *
   * `guard` è escluso perché nasce qui dentro (`createAuthGuard(audit)`, con
   * l'audit di questo server): chi costruisce il server non lo porta, lo riceve.
   */
  features?: Omit<V1Deps, "db" | "guard"> & {
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
     * ADR-019 phase 2 removed its `accountId` dependency: which house a birth
     * belongs to is a property of the request, not of the process.
     */
    gosini?: {
      /**
       * ADR-070: the house's data key, so a birth can be signed by both
       * parents (their private keys are ciphertext at rest). Absent = births
       * still happen, with an `unsigned` lineage.
       */
      dataKey?: Buffer;
      /**
       * ADR-073: il libro genealogico, in un container suo. Assente = si
       * nasce lo stesso, senza atto in catena.
       */
      chain?: { baseUrl: string; token: string };
      /** ADR-074: senza, il sapere adottato si ripesca solo per parole */
      embedder?: { embed: (texts: string[]) => Promise<number[][]> };
    };
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
      llmFor: (accountId: string, gosinoId: string, clock?: HouseClock) => LlmClient;
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
    prints?: (accountId: string) => {
      claimPrint: (input: {
        printId: string;
        beingId: string;
        gosinoId: string;
      }) => Promise<"learned" | "refused" | "unreachable">;
    };
    /** gruppo 12: il meteo vero per il cielo del recinto; assente = rotta muta */
    /** `db` lo mette il server: chi lo costruisce porta solo il ripiego d'ambiente */
    weather?: Omit<WeatherDeps, "db">;
    /** backlog gruppo 3: il server MCP di sola lettura — assente = la rotta non esiste */
    mcp?: { embedder: McpRouteDeps["embedder"]; dataKey?: Buffer };
    /** gruppo 13: la voce interim — assente = 204 e voce di sistema */
    tts?: TtsRouteDeps["tts"];
    /** decisione 2026-08-16: la voce di casa (Piper), gradino di mezzo */
    ttsLocal?: TtsRouteDeps["local"];
    /** gruppo 13: la dettatura locale, per casa — assente = 501 e browser */
    stt?: SttRouteDeps["transcriber"];
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
  // In produzione il muso lo serve soul (`faceRoot`, cioè `UGO_FACE_DIR`):
  // stessa origin, quindi CORS non serve a niente e riflettere qualunque
  // `Origin` regala soltanto a una pagina qualsiasi il diritto di LEGGERE le
  // risposte di soul. La giustificazione storica — «no cookies or
  // credentials» — copre i cookie e non copre il resto: il pannello tiene il
  // bearer in `localStorage` sulla stessa origin, e le rotte aperte per
  // ADR-007 rispondono comunque a chi le chiama.
  //
  // In dev il muso gira su Vite, su una porta diversa: lì la posizione
  // permissiva resta quella giusta, ed è l'unico posto in cui serviva.
  app.register(cors, { origin: options.faceRoot === undefined });
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
      weather,
      mcp,
      tts,
      ttsLocal,
      stt,
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
      guard,
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
    // Guardata: è una pagina di chat pronta all'uso che scrive nella biografia
    // della casa e spende il salvadanaio, e l'immagine di produzione la serve
    // esattamente come in sviluppo. «Debug» è il nome, non un confine.
    registerDebugChatRoute(app, guard);
    // il selettore del pannello: aperta al solo token, che e' gia' abbastanza
    // — dice quali case *quel* token puo' vedere, e per quasi tutti e' una
    registerAccountRoutes(app, {
      db: options.db,
      guard,
      audit,
      ...(options.createHouse !== undefined && { createHouse: options.createHouse }),
    });
    // cosa è acceso e cosa no: il pannello lo mostra invece di far cercare
    // un guasto dove c'è solo una variabile non impostata
    if (options.capabilities !== undefined) {
      registerCapabilitiesRoute(app, { guard, snapshot: options.capabilities });
    }
    // gruppo 12: il tempo che fa, per il cielo del recinto. Aperta come
    // /v1/rooms — il corpo non porta un token — e muta senza coordinate
    registerWeatherRoute(app, { db: options.db, ...(weather ?? {}) });
    // gruppo 13: la voce interim — il salvadanaio sta nel client (regola 3)
    // backlog gruppo 3: la memoria interrogabile da altri agenti, sola lettura
    if (mcp !== undefined) {
      registerMcpRoute(app, {
        db: options.db,
        embedder: mcp.embedder,
        // ADR-079: il diario esce da qui in chiaro comunque sia scritto
        ...(mcp.dataKey !== undefined && { dataKey: mcp.dataKey }),
      });
    }
    registerTtsRoute(app, {
      db: options.db,
      ...(tts !== undefined && { tts }),
      ...(ttsLocal !== undefined && { local: ttsLocal }),
    });
    registerSttRoute(app, { db: options.db, ...(stt !== undefined && { transcriber: stt }) });
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
      registerMeetingsRoutes(app, { db: options.db, service: meetings, guard });
    }
    if (privacy !== undefined) {
      registerPrivacyRoutes(app, { db: options.db, ...privacy, guard, audit });
    }
    // ADR-090: e i conti sempre, anche senza i due servizi — dire cosa si
    // tiene è il gradino prima di ogni diritto
    registerDataSummaryRoute(app, { db: options.db, guard });
    // the archive is about memories and meetings, and had no business being
    // gated on the species map: it was registered there only because both
    // arrived in the same afternoon
    registerArchiveRoutes(app, {
      db: options.db,
      chat: v1.chat,
      guard,
      // ADR-086: senza la chiave il pannello mostrava il lascito in base64
      ...(gosini?.dataKey !== undefined && { dataKey: gosini.dataKey }),
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
        faces: (accountId: string) => ({
          askVoice: (beingId: string, name: string): void => {
            for (const runtime of registry.all(accountId)) {
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
      // ADR-069: the litter lives and dies with the population routes
      registerLitterRoutes(app, {
        db: options.db,
        guard,
        ...(registry !== undefined && { registry }),
        // ADR-070: whoever holds the data key can mint the parents' signatures
        ...(gosini.dataKey !== undefined && {
          peers: new PeerService(options.db, gosini.dataKey),
        }),
        // ADR-073: gli atti vanno nel libro genealogico, se ce n'è uno
        ...(gosini.chain !== undefined && {
          chain: new RegistryClient(gosini.chain),
        }),
      });
      // ADR-072: il salvadanaio vive con la popolazione, come la cucciolata
      registerPiggyBankRoutes(app, { db: options.db, guard });
      // ADR-074/075: la dote e il congedo — servono la chiave della casa,
      // che è ciò che avvolge la chiave dell'interiorità di ogni esemplare
      if (gosini.dataKey !== undefined) {
        registerDowryRoutes(app, {
          db: options.db,
          guard,
          dataKey: gosini.dataKey,
          ...(gosini.embedder !== undefined && { embedder: gosini.embedder }),
          ...(registry !== undefined && { registry }),
        });
        // ADR-076: le liste si vedono e si spuntano anche dal pannello
        registerListRoutes(app, { db: options.db, guard, dataKey: gosini.dataKey });
        // ADR-079: il libro della vita, che nessuno aveva mai potuto leggere
        registerDiaryRoutes(app, {
          db: options.db,
          guard,
          dataKey: gosini.dataKey,
          ...(registry !== undefined && { registry }),
        });
        // ADR-087: come sta il branco nel tempo, una serie per creatura
        registerPackMoodRoutes(app, { db: options.db, guard });
        // ADR-086: il libro dei ricordi — scorrere, non solo cercare
        registerMemoryBookRoutes(app, {
          db: options.db,
          guard,
          dataKey: gosini.dataKey,
          ...(registry !== undefined && { registry }),
        });
        // ADR-085: le domande che tornano, viste e fermabili dal pannello
        registerCheckinRoutes(app, { db: options.db, guard });
        // ADR-084: l'adozione — prenotare è pubblico, il resto è dell'allevamento
        registerAdoptionRoutes(app, {
          db: options.db,
          guard,
          ...(options.createHouse !== undefined && {
            createHouse: async (input) => {
              const born = await options.createHouse?.({ slug: input.slug, name: input.name, ...(input.timezone !== undefined && { timezone: input.timezone }) });
              if (born === undefined) throw new Error("le case non si creano qui");
              return { accountId: born.accountId, ownerToken: born.ownerToken };
            },
          }),
          ...(registry !== undefined && { registry }),
          ...(gosini.chain !== undefined && { chain: new RegistryClient(gosini.chain) }),
        });
        // ADR-083: la vetrina — guardare è pubblico, mettere in vetrina no
        registerVetrinaRoutes(app, {
          db: options.db,
          guard,
          ...(gosini.chain !== undefined && { chain: new RegistryClient(gosini.chain) }),
        });
        // ADR-082: la cessione di un nato, e l'atto in catena
        registerTransferRoutes(app, {
          db: options.db,
          guard,
          ...(registry !== undefined && { registry }),
          ...(gosini.chain !== undefined && { chain: new RegistryClient(gosini.chain) }),
        });
        registerFarewellRoutes(app, {
          db: options.db,
          guard,
          dataKey: gosini.dataKey,
          ...(registry !== undefined && { registry }),
          ...(gosini.chain !== undefined && { chain: new RegistryClient(gosini.chain) }),
        });
      }
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
            psycheFor: (accountId: string, gosinoId: string) =>
              registry.all(accountId).find((runtime) => runtime.id === gosinoId)?.psyche,
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
          props: (accountId, room) => props.inRoom(accountId, room),
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
