import { beings, bonds, perceptionEvents, recognitionProfiles, type DbClient } from "@ugo/db";
import { KNOWN_SPECIES, profileFor } from "@ugo/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BeingNotFoundError, type BeingsService } from "../../services/beingsService.js";
import {
  createBeingSchema,
  enrollSchema,
  patchBeingSchema,
  problem,
  uuidParam,
  type PackRouteDeps,
} from "./shared.js";
import { putAudioObject } from "../audio.js";
import { eldestExemplarOf, householdScope } from "../scope.js";

/** Ten seconds of speech at Opus bitrates is well under this. */
const MAX_ENROLLMENT_BYTES = 4 * 1024 * 1024;

/** The beings themselves: read, create, amend, and teach a voice. */
export function registerBeingRoutes(
  app: FastifyInstance,
  deps: PackRouteDeps,
  serviceFor: (householdId: string) => BeingsService,
): void {
  const db: DbClient = deps.db;

  app.get("/v1/pack", async (request, reply) => {
    const householdId = await householdScope(db, request, reply);
    if (householdId === undefined) return reply;
    const gosinoId = await eldestExemplarOf(db, householdId);
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
      })
      .from(beings)
      .leftJoin(bonds, and(eq(bonds.beingId, beings.id), eq(bonds.gosinoId, gosinoId)))
      .leftJoin(
        recognitionProfiles,
        and(eq(recognitionProfiles.beingId, beings.id), eq(recognitionProfiles.modality, "voice")),
      )
      .where(eq(beings.householdId, householdId))
      .orderBy(desc(beings.createdAt));
    return reply.send({
      gosinoId,
      beings: rows.map((row) => ({
        ...row,
        familiarity: row.familiarity ?? 0,
        affinity: row.affinity ?? 0,
        hasVoiceProfile: row.voiceSamples !== null,
        voiceSamples: row.voiceSamples ?? 0,
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
    const householdId = await householdScope(db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { arrivalAt, notes, ...rest } = parsed.data;
    const [created] = await db
      .insert(beings)
      .values({
        householdId,
        ...rest,
        ...(arrivalAt !== undefined && { arrivalAt }),
        ...(notes !== undefined && { notes }),
      })
      .returning({ id: beings.id });
    // the bond starts at zero: UGO is the newcomer, he has to earn it
    if (created !== undefined) {
      await db.insert(bonds).values({
        householdId,
        gosinoId: await eldestExemplarOf(db, householdId),
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
    const householdId = await householdScope(db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    try {
      return await reply.send(await serviceFor(householdId).update(id, parsed.data));
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
    const householdId = await householdScope(db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    return reply.send({ destroyed: await serviceFor(householdId).destroyVoice(id) });
  });

  /**
   * ADR-052: «dimentica la mia faccia, ma resto nel branco».
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
    const householdId = await householdScope(db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    return reply.send({
      destroyed: await serviceFor(householdId).destroyRecognition(id, "face"),
    });
  });

  app.post("/v1/beings/:id/enroll/voice", { preHandler: deps.guard }, async (request, reply) => {
    const id = uuidParam(request.params);
    const parsed = enrollSchema.safeParse(request.body);
    if (id === undefined || !parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid enrollment request", 400));
    }
    const householdId = await householdScope(db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const [being] = await db
      .select({ isMinor: beings.isMinor, noAudio: beings.noAudio })
      .from(beings)
      .where(and(eq(beings.id, id), eq(beings.householdId, householdId)));
    if (being === undefined) {
      return reply.code(404).type("application/problem+json").send(problem("Being not found", 404));
    }
    // refused here as well as in the job: the request must not even be filed
    // for someone whose voice we have promised never to model (ADR-016)
    if (being.isMinor || being.noAudio) {
      return reply
        .code(403)
        .type("application/problem+json")
        .send(
          problem(
            "Biometric enrollment refused",
            403,
            being.isMinor ? "minor_biometrics_forbidden" : "opted_out_of_audio",
          ),
        );
    }
    await db.insert(perceptionEvents).values({
      gosinoId: await eldestExemplarOf(db, householdId),
      modality: "audio_speech",
      beingId: id,
      observed: { kind: "enrollment_requested", object_key: parsed.data.objectKey, channel: "home" },
    });
    return reply.code(202).send({ status: "queued" });
  });

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
        const householdId = await householdScope(db, request, reply, { requireAdmin: true });
        if (householdId === undefined) return reply;
        const [being] = await db
          .select({ isMinor: beings.isMinor, noAudio: beings.noAudio })
          .from(beings)
          .where(and(eq(beings.id, id), eq(beings.householdId, householdId)));
        if (being === undefined) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem("Being not found", 404));
        }
        if (being.isMinor || being.noAudio) {
          return reply
            .code(403)
            .type("application/problem+json")
            .send(
              problem(
                "Biometric enrollment refused",
                403,
                being.isMinor ? "minor_biometrics_forbidden" : "opted_out_of_audio",
              ),
            );
        }
        // refuse BEFORE storing: audio for someone we promised not to model
        // must not sit in the bucket even for a night (ADR-016)
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
        const objectKey = `inbox/enroll_${id.slice(0, 8)}_${stamp}.webm`;
        await putAudioObject(storage, objectKey, body, "audio/webm");
        await db.insert(perceptionEvents).values({
          gosinoId: await eldestExemplarOf(db, householdId),
          modality: "audio_speech",
          beingId: id,
          observed: { kind: "enrollment_requested", object_key: objectKey, channel: "home" },
        });
        request.log.info({ beingId: id, bytes: body.length }, "enrollment audio stored");
        return reply.code(202).send({ status: "queued", objectKey });
      },
    );
  }
}
