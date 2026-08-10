import {
  PRIME_GOSINO_ID,
  beings,
  bonds,
  corrections,
  perceptionEvents,
  recognitionProfiles,
  type DbClient,
} from "@ugo/db";
import {
  BEING_KINDS,
  CORRECTION_SIGNALS,
  KNOWN_SPECIES,
  profileFor,
  type SpeciesMap,
} from "@ugo/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";

/**
 * The pack over HTTP (ADR-014/016). Everything here is guarded: adding a being
 * or asking UGO to learn a voice are not things a stray request should do.
 *
 * Enrollment is filed, not performed: the clip is already in object storage,
 * and tonight's dream turns it into a centroid. UGO says "me lo segno" instead
 * of pretending to have learned on the spot.
 */

const createBeingSchema = z.object({
  displayName: z.string().min(1).max(120),
  // not an enum on purpose (ADR-014): a species we do not know yet must be
  // accepted, and degrade to the cautious `unknown` profile
  species: z.string().min(1).max(40).default("human"),
  kind: z.enum(BEING_KINDS).default("resident"),
  arrivalAt: z.iso.date().optional(),
  isMinor: z.boolean().default(false),
  noVision: z.boolean().default(false),
  noAudio: z.boolean().default(false),
  aliases: z.array(z.string().min(1).max(80)).max(10).default([]),
  notes: z.string().max(500).optional(),
});

const enrollSchema = z.object({
  /** object key of a clip already uploaded through /v1/audio/presign */
  objectKey: z.string().min(1).max(300),
});

const correctionSchema = z.object({
  beingId: z.uuid().optional(),
  aboutBeing: z.uuid().optional(),
  signal: z.enum(CORRECTION_SIGNALS),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export interface PackRouteDeps {
  db: DbClient;
  speciesMap: SpeciesMap;
  guard: PreHandler;
  gosinoId?: string;
}

function problem(title: string, status: number, detail?: string): Record<string, unknown> {
  return { type: "about:blank", title, status, ...(detail !== undefined && { detail }) };
}

export function registerPackRoutes(app: FastifyInstance, deps: PackRouteDeps): void {
  const gosinoId = deps.gosinoId ?? PRIME_GOSINO_ID;

  app.get("/v1/pack", async (_request, reply) => {
    const rows = await deps.db
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
    const { arrivalAt, notes, ...rest } = parsed.data;
    const [created] = await deps.db
      .insert(beings)
      .values({
        ...rest,
        ...(arrivalAt !== undefined && { arrivalAt }),
        ...(notes !== undefined && { notes }),
      })
      .returning({ id: beings.id });
    // the bond starts at zero: UGO is the newcomer, he has to earn it
    if (created !== undefined) {
      await deps.db.insert(bonds).values({ gosinoId, beingId: created.id });
    }
    return reply.code(201).send({ id: created?.id });
  });

  app.post("/v1/beings/:id/enroll/voice", { preHandler: deps.guard }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id?: string }).id);
    const parsed = enrollSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid enrollment request", 400));
    }
    const [being] = await deps.db
      .select({ isMinor: beings.isMinor, noAudio: beings.noAudio })
      .from(beings)
      .where(eq(beings.id, id.data));
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
    await deps.db.insert(perceptionEvents).values({
      gosinoId,
      modality: "audio_speech",
      beingId: id.data,
      observed: { kind: "enrollment_requested", object_key: parsed.data.objectKey, channel: "home" },
    });
    return reply.code(202).send({ status: "queued" });
  });

  app.post("/v1/corrections", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = correctionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem("Invalid correction", 400, z.prettifyError(parsed.error)));
    }
    const { beingId, aboutBeing, ...rest } = parsed.data;
    await deps.db.insert(corrections).values({
      gosinoId,
      ...rest,
      ...(beingId !== undefined && { beingId }),
      ...(aboutBeing !== undefined && { aboutBeing }),
    });
    return reply.code(201).send({ status: "recorded" });
  });
}
