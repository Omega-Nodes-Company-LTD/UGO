import { randomUUID } from "node:crypto";
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { houseChunks, houseDocuments, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * I documenti di casa (ADR-111): «UGO conosce solo ciò che ha sentito».
 *
 * Il giro è quello dei documenti dei clienti (ADR-054) e non è un caso: il
 * pezzo difficile — bucket privato, chiave opaca, nome cifrato, estrazione e
 * indice di notte — era già scritto e provato. Qui cambia il perimetro, che è
 * la famiglia, e cambia di conseguenza il muro.
 *
 * Il file **non passa da soul**: il pannello lo carica direttamente nel bucket
 * con un URL firmato che scade. Far transitare un PDF di duecento pagine
 * dentro l'anima vorrebbe dire tenerlo in RAM per il gusto di rimetterlo dove
 * sarebbe andato comunque.
 */

const presignSchema = z.object({
  filename: z.string().min(1).max(200),
  mime: z.string().min(1).max(120),
});

const documentSchema = z.object({
  s3Key: z.string().min(1).max(300),
  filename: z.string().min(1).max(200),
  mime: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(0).max(200_000_000).default(0),
});

/** Quanto vive l'URL firmato: il tempo di un caricamento, non di una giornata. */
const PRESIGN_TTL_SECONDS = 600;

export interface HouseDocsStorage {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export interface HouseDocsDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  /** assente = documenti non configurati su questo server, e si dice */
  storage?: HouseDocsStorage;
}

export function registerHouseDocRoutes(app: FastifyInstance, deps: HouseDocsDeps): void {
  const readable = (value: string): string => {
    try {
      return decryptText(value, deps.dataKey);
    } catch {
      return "[nome non leggibile]";
    }
  };

  const client = (storage: HouseDocsStorage): S3Client =>
    new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: true,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
    });

  app.get("/v1/documents", { preHandler: deps.guard }, async (request, reply) => {
    const rows = await inAccount(deps.db, request, reply, {}, async (db, accountId) =>
      db
        .select({
          id: houseDocuments.id,
          filename: houseDocuments.filename,
          mime: houseDocuments.mime,
          sizeBytes: houseDocuments.sizeBytes,
          uploadedAt: houseDocuments.uploadedAt,
          indexedAt: houseDocuments.indexedAt,
          status: houseDocuments.status,
        })
        .from(houseDocuments)
        .where(eq(houseDocuments.accountId, accountId))
        .orderBy(desc(houseDocuments.uploadedAt)),
    );
    if (rows === undefined) return reply;
    return reply.send({
      documents: rows.map((row) => ({ ...row, filename: readable(row.filename) })),
    });
  });

  app.post("/v1/documents/presign", { preHandler: deps.guard }, async (request, reply) => {
    if (deps.storage === undefined) {
      return reply.status(503).send({ error: "documenti non configurati su questo server" });
    }
    const parsed = presignSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const storage = deps.storage;
    const scope = await inAccount(deps.db, request, reply, { requireAdmin: true }, (_db, accountId) =>
      Promise.resolve(accountId),
    );
    if (scope === undefined) return reply;
    // chiave opaca: il nome del file è contenuto e resta cifrato nella riga
    const key = `house/${scope}/${randomUUID()}`;
    const url = await getSignedUrl(
      client(storage),
      new PutObjectCommand({ Bucket: storage.bucket, Key: key, ContentType: parsed.data.mime }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return reply.send({ url, key, expiresInSeconds: PRESIGN_TTL_SECONDS });
  });

  app.post("/v1/documents", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = documentSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const row = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const [inserted] = await db
          .insert(houseDocuments)
          .values({
            accountId,
            s3Key: parsed.data.s3Key,
            filename: encryptText(parsed.data.filename, deps.dataKey),
            mime: parsed.data.mime,
            sizeBytes: parsed.data.sizeBytes,
          })
          .returning({ id: houseDocuments.id });
        return inserted;
      },
    );
    if (row === undefined) return reply;
    // indicizzato dal sogno, non qui: un PDF lungo è centinaia di embedding e
    // nessuno deve restare col dito sul bottone ad aspettarli
    return reply.status(201).send({ id: row.id, indexed: false });
  });

  app.delete("/v1/documents/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.status(400).send({ error: "invalid id" });

    /**
     * Prima l'oggetto, poi le righe — la stessa regola dell'oblio di un
     * cliente (ADR-093): se muore a metà, ciò che resta è una riga senza file,
     * riprovabile. L'ordine opposto lascerebbe un file nel bucket che nessuno
     * sa più di avere.
     */
    const found = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const [row] = await db
          .select({ s3Key: houseDocuments.s3Key })
          .from(houseDocuments)
          .where(and(eq(houseDocuments.id, id.data), eq(houseDocuments.accountId, accountId)));
        // l'involucro distingue «la casa non è tua» (risposta già mandata) da
        // «il documento non c'è»: senza, i due casi diventano lo stesso 404
        return { row };
      },
    );
    if (found === undefined) return reply;
    if (found.row === undefined) return reply.status(404).send({ error: "not found" });

    if (deps.storage !== undefined) {
      await client(deps.storage).send(
        new DeleteObjectCommand({ Bucket: deps.storage.bucket, Key: found.row.s3Key }),
      );
    }
    const gone = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        await db.delete(houseChunks).where(
          and(eq(houseChunks.documentId, id.data), eq(houseChunks.accountId, accountId)),
        );
        await db
          .delete(houseDocuments)
          .where(and(eq(houseDocuments.id, id.data), eq(houseDocuments.accountId, accountId)));
        return true;
      },
    );
    if (gone === undefined) return reply;
    return reply.status(204).send();
  });
}
