import { beings, bonds, recognitionProfiles, type DbClient } from "@ugo/db";
import { KNOWN_SPECIES, profileFor } from "@ugo/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BeingNotFoundError, type BeingsService } from "../../services/beingsService.js";
import {
  createBeingSchema,
  patchBeingSchema,
  problem,
  uuidParam,
  type PackRouteDeps,
} from "./shared.js";
import { eldestExemplarOf, accountScope } from "../scope.js";
import { storeVoiceSample } from "../../services/voiceEnrolment.js";

/** Ten seconds of speech at Opus bitrates is well under this. */
const MAX_ENROLLMENT_BYTES = 4 * 1024 * 1024;

/** The beings themselves: read, create, amend, and teach a voice. */
export function registerBeingRoutes(
  app: FastifyInstance,
  deps: PackRouteDeps,
  serviceFor: (accountId: string) => BeingsService,
): void {
  const db: DbClient = deps.db;

  app.get("/v1/pack", async (request, reply) => {
    const accountId = await accountScope(db, request, reply);
    if (accountId === undefined) return reply;
    const gosinoId = await eldestExemplarOf(db, accountId);
    // ADR-057: anche il volto, per la pagina «I volti» — che chiamava una
    // rotta /v1/beings mai esistita e moriva con un 404 (visto in produzione)
    const faceProfiles = alias(recognitionProfiles, "face_profiles");
    const rows = await db
      .select({
        id: beings.id,
        displayName: beings.displayName,
        species: beings.species,
        kind: beings.kind,
        isMinor: beings.isMinor,
        noVision: beings.noVision,
        noAudio: beings.noAudio,
        familiarity: bonds.familiarity,
        affinity: bonds.affinity,
        // whether UGO can already recognize the voice, and how well fed the
        // centroid is — the panel shows it so enrollment is not guesswork
        voiceSamples: recognitionProfiles.sampleCount,
        faceSamples: faceProfiles.sampleCount,
        /**
         * Com'è andato l'ULTIMO arruolamento vocale, e quanti ne restano in
         * attesa. Esistevano già come righe di `perception_events` e non li
         * mostrava nessuna interfaccia: per sapere perché un maiale non
         * imparava una voce bisognava aprire `psql` e sapere cosa cercare —
         * cioè non saperlo. L'esito porta la ragione (`failed:NoSuchKey`,
         * `refused:minor_biometrics_forbidden`), che è ciò che serve per
         * rimediare senza indovinare.
         */
        voiceOutcome: sql<string | null>`(
          select d.observed->>'outcome' from perception_events d
          where d.being_id = ${beings.id} and d.observed->>'kind' = 'enrollment'
          order by d.occurred_at desc limit 1
        )`,
        voiceOutcomeAt: sql<string | null>`(
          select d.occurred_at from perception_events d
          where d.being_id = ${beings.id} and d.observed->>'kind' = 'enrollment'
          order by d.occurred_at desc limit 1
        )`,
        voicePending: sql<number>`(
          select count(*) from perception_events r
          where r.being_id = ${beings.id}
            and r.observed->>'kind' = 'enrollment_requested'
            and not exists (
              select 1 from perception_events d
              where d.observed->>'kind' = 'enrollment'
                and d.observed->>'request_id' = r.id::text
            )
        )`,
      })
      .from(beings)
      .leftJoin(bonds, and(eq(bonds.beingId, beings.id), eq(bonds.gosinoId, gosinoId)))
      .leftJoin(
        recognitionProfiles,
        and(eq(recognitionProfiles.beingId, beings.id), eq(recognitionProfiles.modality, "voice")),
      )
      .leftJoin(
        faceProfiles,
        and(eq(faceProfiles.beingId, beings.id), eq(faceProfiles.modality, "face")),
      )
      .where(eq(beings.accountId, accountId))
      .orderBy(desc(beings.createdAt));
    return reply.send({
      gosinoId,
      beings: rows.map((row) => ({
        ...row,
        familiarity: row.familiarity ?? 0,
        affinity: row.affinity ?? 0,
        hasVoiceProfile: row.voiceSamples !== null,
        voiceSamples: row.voiceSamples ?? 0,
        hasFaceProfile: row.faceSamples !== null,
        channels: profileFor(deps.speciesMap, row.species).channels,
      })),
      knownSpecies: KNOWN_SPECIES,
    });
  });

  app.post("/v1/beings", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = createBeingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid being", 400, z.prettifyError(parsed.error)));
    }
    const accountId = await accountScope(db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    const { arrivalAt, notes, ...rest } = parsed.data;
    const [created] = await db
      .insert(beings)
      .values({
        accountId,
        ...rest,
        ...(arrivalAt !== undefined && { arrivalAt }),
        ...(notes !== undefined && { notes }),
      })
      .returning({ id: beings.id });
    // the bond starts at zero: UGO is the newcomer, he has to earn it
    if (created !== undefined) {
      await db.insert(bonds).values({
        accountId,
        gosinoId: await eldestExemplarOf(db, accountId),
        beingId: created.id,
      });
    }
    return reply.code(201).send({ id: created?.id });
  });

  /**
   * Consent is not given once and for all: somebody can ask later not to be
   * listened to. Setting that here DESTROYS the voiceprint (BeingsService)
   * instead of merely ignoring it from now on.
   */
  app.patch("/v1/beings/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = uuidParam(request.params);
    const parsed = patchBeingSchema.safeParse(request.body);
    if (id === undefined || !parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(
          problem("Invalid being patch", 400, parsed.success ? undefined : z.prettifyError(parsed.error)),
        );
    }
    const accountId = await accountScope(db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    try {
      return await reply.send(await serviceFor(accountId).update(id, parsed.data));
    } catch (error) {
      if (error instanceof BeingNotFoundError) {
        return reply.code(404).type("application/problem+json").send(problem("Being not found", 404));
      }
      throw error;
    }
  });

  /** "Cancella la mia voce, ma resto nel branco." */
  app.delete("/v1/beings/:id/recognition/voice", { preHandler: deps.guard }, async (request, reply) => {
    const id = uuidParam(request.params);
    if (id === undefined) {
      return reply.code(400).type("application/problem+json").send(problem("Invalid being id", 400));
    }
    const accountId = await accountScope(db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    return reply.send({ destroyed: await serviceFor(accountId).destroyVoice(id) });
  });

  /**
   * ADR-057: «dimentica la mia faccia, ma resto nel branco».
   *
   * La gemella di quella sopra, e serve che sia una rotta sua: cancellare la
   * voce e cancellare il volto sono due revoche diverse, e una sola che le
   * facesse entrambe toglierebbe alla persona la possibilità di revocarne una.
   */
  app.delete("/v1/beings/:id/recognition/face", { preHandler: deps.guard }, async (request, reply) => {
    const id = uuidParam(request.params);
    if (id === undefined) {
      return reply.code(400).type("application/problem+json").send(problem("Invalid being id", 400));
    }
    const accountId = await accountScope(db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    return reply.send({
      destroyed: await serviceFor(accountId).destroyRecognition(id, "face"),
    });
  });

  /**
   * ADR-101: **la variante col presign non c'è più.**
   *
   * Prendeva una `objectKey` già caricata sul bucket e la metteva in coda per
   * il job. Il pannello l'aveva abbandonata per il CORS (vedi sotto) e non
   * l'ha mai sostituita nessuno: era una porta senza consumatori, senza test,
   * che accettava un riferimento a un oggetto e lo attribuiva a una persona —
   * cioè esattamente il tipo di codice che non si tiene «per ogni evenienza»
   * quando tocca la biometria. Se un giorno un client mobile caricherà da
   * solo, questa rotta si riscrive in venti righe, **con i suoi test**.
   */

  /**
   * The same enrolment, with the audio sent to us instead of to the bucket.
   *
   * The panel used to presign and PUT straight to object storage, which is a
   * cross-origin request: without a CORS rule on the bucket the browser never
   * even sends it and reports "Failed to fetch". Ten seconds of speech is
   * small enough to pass through soul, and one origin is one thing that can
   * go wrong instead of two.
   */
  if (deps.audio !== undefined) {
    const storage = deps.audio;
    app.post(
      "/v1/beings/:id/enroll/voice/audio",
      { preHandler: deps.guard, bodyLimit: MAX_ENROLLMENT_BYTES },
      async (request, reply) => {
        const id = uuidParam(request.params);
        const body = request.body;
        if (id === undefined || !Buffer.isBuffer(body) || body.length === 0) {
          return reply
            .code(400)
            .type("application/problem+json")
            .send(problem("Invalid enrollment audio", 400));
        }
        const accountId = await accountScope(db, request, reply, { requireAdmin: true });
        if (accountId === undefined) return reply;
        // il servizio rifiuta PRIMA di scrivere nel bucket (ADR-016), e da
        // quando il chiosco è un secondo chiamante i controlli vivono lì
        const stored = await storeVoiceSample(
          { db, storage },
          { accountId, beingId: id, audio: body },
        );
        if (stored.outcome === "not_found") {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem("Being not found", 404));
        }
        if (stored.outcome === "refused") {
          return reply
            .code(403)
            .type("application/problem+json")
            .send(problem("Biometric enrollment refused", 403, stored.reason));
        }
        request.log.info({ beingId: id, bytes: body.length }, "enrollment audio stored");
        return reply.code(202).send({ status: "queued", objectKey: stored.objectKey });
      },
    );
  }
}
