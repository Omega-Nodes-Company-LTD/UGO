import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { PreHandler } from "./guard.js";
import { z } from "zod";

/**
 * Presigned upload for "in giro" recordings (PROGETTO §4.2, SECURITY §4):
 * soul is the authorizing proxy, the body PUTs straight to the private
 * bucket with a short-lived URL. S3 credentials never leave the server.
 */

export interface AudioStorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** provider region: Hetzner rejects a wrong one, AWS-alikes ignore it */
  region: string;
}

const PRESIGN_TTL_SECONDS = 300;

/**
 * Store audio that reached us over our own origin.
 *
 * The presigned PUT below is right for the wearable, which uploads a day of
 * recordings and should not stream them through soul. It is wrong for the
 * panel: a browser PUT to the bucket is cross-origin, and an object store
 * without a CORS rule answers the preflight with nothing at all — which the
 * browser reports as the famously unhelpful "Failed to fetch". MinIO is
 * permissive by default, so the tests never saw it and Hetzner did.
 */
export async function putAudioObject(
  cfg: AudioStorageConfig,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    forcePathStyle: true,
  });
  await client.send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

// naming contract §4.2: YYYY-MM-DD_HHmm_<slug>.<ext>
const presignRequestSchema = z.object({
  filename: z
    .string()
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(opus|webm|ogg|wav)$/, "invalid audio filename"),
});

function problem(reply: FastifyReply, status: number, title: string, detail?: string): void {
  void reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerAudioRoutes(
  app: FastifyInstance,
  storage: AudioStorageConfig,
  guard: PreHandler,
): void {
  const client = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: true, // MinIO and most S3-compatibles
    credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
  });

  app.post("/v1/audio/presign", { preHandler: guard }, async (request, reply) => {
    const parsed = presignRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid presign request", z.prettifyError(parsed.error));
      return;
    }
    const key = `inbox/${parsed.data.filename}`;
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: storage.bucket, Key: key }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    // log ids/keys only, never URLs (they carry the signature)
    request.log.info({ key }, "audio presign issued");
    return reply.send({ url, key, expiresInSeconds: PRESIGN_TTL_SECONDS });
  });
}
