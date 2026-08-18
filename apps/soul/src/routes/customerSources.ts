import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  customerChunks,
  customerDocuments,
  customerMailAccounts,
  customerRepos,
  customers,
  type DbClient,
} from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import type { AudioStorageConfig } from "./audio.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * The customer's knowledge sources (ADR-054), from the panel: repos to clone
 * and index, a mailbox to read (never to write), documents in the private
 * bucket. Credentials go in encrypted and never come back out — not in a GET,
 * not in a log, not in an export.
 */

const repoSchema = z.object({
  remoteUrl: z
    .string()
    .min(1)
    .max(300)
    .regex(/^(https:\/\/|git@|file:\/\/)[^\s]+$/, "invalid git remote"),
  defaultBranch: z.string().min(1).max(80).default("main"),
  pat: z.string().min(1).max(300).optional(),
});

const mailSchema = z.object({
  imapHost: z.string().min(1).max(200),
  imapPort: z.number().int().min(1).max(65535).default(993),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(300),
  folder: z.string().min(1).max(100).default("INBOX"),
  /**
   * Il pre-filtro del proprietario (2026-08-16): indirizzi e domini ammessi,
   * separati da virgola («mario@rossi.it, @rossisrl.it»). Il sync indicizza
   * un messaggio solo se mittente o destinatari combaciano; vuoto = tutta la
   * cartella. Serve quando la casella è condivisa e per QUEL cliente vanno
   * lette solo le mail sue.
   */
  senders: z.string().max(2000).optional(),
});

const presignSchema = z.object({
  filename: z
    .string()
    .max(160)
    .regex(/^[A-Za-z0-9][\w. ()-]*\.(pdf|txt|md|csv)$/i, "invalid document filename"),
  mime: z.string().min(3).max(100),
});

const documentSchema = z.object({
  s3Key: z.string().min(1).max(300),
  filename: z.string().min(1).max(160),
  mime: z.string().min(3).max(100),
  sizeBytes: z.number().int().min(0),
});

const PRESIGN_TTL_SECONDS = 300;

function problem(reply: FastifyReply, status: number, title: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status });
}

export interface CustomerSourcesDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  audit?: AuditLogger;
  /** the private docs bucket; absent = uploads answer 503, honestly */
  docsStorage?: AudioStorageConfig;
  /** optional HTTP trigger of the jobs runner for an out-of-band sync */
  syncTriggerUrl?: string;
}

export function registerCustomerSourcesRoutes(
  app: FastifyInstance,
  deps: CustomerSourcesDeps,
): void {
  const { db, guard, dataKey, audit } = deps;
  const admin = { preHandler: guard };

  /**
   * ADR-062: risoluzione del cliente E lavoro nella STESSA transazione che ha
   * dichiarato la casa. `undefined` = problem già inviato; "missing" dentro il
   * work = 404 gestito qui.
   */
  const inCustomer = async <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (tx: DbClient, scope: { accountId: string; customerId: string }) => Promise<T>,
  ): Promise<T | undefined> => {
    const out = await inAccount(db, request, reply, { requireAdmin: true }, async (tx, accountId) => {
      const { id } = request.params as { id: string };
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.accountId, accountId)));
      if (customer === undefined) return "missing" as const;
      return { value: await work(tx, { accountId, customerId: customer.id }) };
    });
    if (out === undefined) return undefined;
    if (out === "missing") {
      await problem(reply, 404, "Not Found");
      return undefined;
    }
    return out.value;
  };

  const audited = async (
    accountId: string,
    request: FastifyRequest,
    resourceId: string,
  ): Promise<void> => {
    await audit?.record({
      verb: "customer_source_added",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "customer_source",
      resourceId,
    });
  };

  /** everything the panel shows about the sources — credentials excluded */
  app.get("/v1/customers/:id/sources", admin, async (request, reply) => {
    const body = await inCustomer(request, reply, async (tx, scope) => {
    const [repos, documents, mail] = await Promise.all([
      tx
        .select({
          id: customerRepos.id,
          remoteUrl: customerRepos.remoteUrl,
          defaultBranch: customerRepos.defaultBranch,
          lastCommitSha: customerRepos.lastCommitSha,
          lastIndexedAt: customerRepos.lastIndexedAt,
          status: customerRepos.status,
          lastError: customerRepos.lastError,
        })
        .from(customerRepos)
        .where(eq(customerRepos.customerId, scope.customerId))
        .orderBy(asc(customerRepos.createdAt)),
      tx
        .select({
          id: customerDocuments.id,
          filename: customerDocuments.filename,
          mime: customerDocuments.mime,
          sizeBytes: customerDocuments.sizeBytes,
          uploadedAt: customerDocuments.uploadedAt,
          indexedAt: customerDocuments.indexedAt,
          status: customerDocuments.status,
        })
        .from(customerDocuments)
        .where(eq(customerDocuments.customerId, scope.customerId))
        .orderBy(asc(customerDocuments.uploadedAt)),
      tx
        .select({
          id: customerMailAccounts.id,
          imapHost: customerMailAccounts.imapHost,
          imapPort: customerMailAccounts.imapPort,
          username: customerMailAccounts.username,
          folder: customerMailAccounts.folder,
          senders: customerMailAccounts.senders,
          lastUid: customerMailAccounts.lastUid,
          lastSyncedAt: customerMailAccounts.lastSyncedAt,
          status: customerMailAccounts.status,
          lastError: customerMailAccounts.lastError,
        })
        .from(customerMailAccounts)
        .where(eq(customerMailAccounts.customerId, scope.customerId))
        .orderBy(asc(customerMailAccounts.createdAt)),
    ]);
    return {
      repos: repos.map((repo) => ({
        ...repo,
        lastIndexedAt: repo.lastIndexedAt?.toISOString() ?? null,
      })),
      documents: documents.map((document) => ({
        ...document,
        filename: safeDecrypt(document.filename, dataKey),
        uploadedAt: document.uploadedAt.toISOString(),
        indexedAt: document.indexedAt?.toISOString() ?? null,
      })),
      mailAccounts: mail.map((account) => ({
        ...account,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      })),
    };
    });
    if (body === undefined) return reply;
    return body;
  });

  app.post("/v1/customers/:id/repos", admin, async (request, reply) => {
    const parsed = repoSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const made = await inCustomer(request, reply, async (tx, scope) => ({
      scope,
      row: (
        await tx
          .insert(customerRepos)
          .values({
            accountId: scope.accountId,
            customerId: scope.customerId,
            remoteUrl: parsed.data.remoteUrl,
            defaultBranch: parsed.data.defaultBranch,
            ...(parsed.data.pat !== undefined && { pat: encryptText(parsed.data.pat, dataKey) }),
          })
          .returning({ id: customerRepos.id })
      )[0],
    }));
    if (made === undefined) return reply;
    if (made.row === undefined) return problem(reply, 500, "Internal Server Error");
    await audited(made.scope.accountId, request, made.row.id);
    return reply.code(201).send({ id: made.row.id });
  });

  app.delete("/v1/customers/:id/repos/:repoId", admin, async (request, reply) => {
    const { repoId } = request.params as { repoId: string };
    const gone = await inCustomer(request, reply, async (tx, scope) => {
      const removed = await tx
        .delete(customerRepos)
        .where(and(eq(customerRepos.id, repoId), eq(customerRepos.customerId, scope.customerId)))
        .returning({ id: customerRepos.id });
      if (removed.length === 0) return false;
      // the index must not outlive its source
      await tx.delete(customerChunks).where(eq(customerChunks.sourceId, repoId));
      return true;
    });
    if (gone === undefined) return reply;
    if (!gone) return problem(reply, 404, "Not Found");
    return reply.code(204).send();
  });

  app.post("/v1/customers/:id/mail", admin, async (request, reply) => {
    const parsed = mailSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const made = await inCustomer(request, reply, async (tx, scope) => ({
      scope,
      row: (
        await tx
          .insert(customerMailAccounts)
          .values({
            accountId: scope.accountId,
            customerId: scope.customerId,
            imapHost: parsed.data.imapHost,
            imapPort: parsed.data.imapPort,
            username: parsed.data.username,
            password: encryptText(parsed.data.password, dataKey),
            folder: parsed.data.folder,
            ...(parsed.data.senders !== undefined &&
              parsed.data.senders.trim() !== "" && { senders: parsed.data.senders.trim() }),
          })
          .returning({ id: customerMailAccounts.id })
      )[0],
    }));
    if (made === undefined) return reply;
    if (made.row === undefined) return problem(reply, 500, "Internal Server Error");
    await audited(made.scope.accountId, request, made.row.id);
    return reply.code(201).send({ id: made.row.id });
  });

  app.delete("/v1/customers/:id/mail/:accountId", admin, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const gone = await inCustomer(request, reply, async (tx, scope) => {
      const removed = await tx
        .delete(customerMailAccounts)
        .where(
          and(
            eq(customerMailAccounts.id, accountId),
            eq(customerMailAccounts.customerId, scope.customerId),
          ),
        )
        .returning({ id: customerMailAccounts.id });
      if (removed.length === 0) return false;
      await tx.delete(customerChunks).where(eq(customerChunks.sourceId, accountId));
      return true;
    });
    if (gone === undefined) return reply;
    if (!gone) return problem(reply, 404, "Not Found");
    return reply.code(204).send();
  });

  app.post("/v1/customers/:id/documents/presign", admin, async (request, reply) => {
    // la firma S3 sta FUORI dal muro: qui serve solo sapere che il cliente è mio
    const scope = await inCustomer(request, reply, (_tx, found) => Promise.resolve(found));
    if (scope === undefined) return reply;
    if (deps.docsStorage === undefined) {
      return problem(reply, 503, "Documenti non configurati su questo server");
    }
    const parsed = presignSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const storage = deps.docsStorage;
    const client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: true,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
    });
    // opaque key: the filename is content and stays encrypted in the row
    const key = `docs/${scope.customerId}/${randomUUID()}`;
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        ContentType: parsed.data.mime,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return { url, key, expiresInSeconds: PRESIGN_TTL_SECONDS };
  });

  app.post("/v1/customers/:id/documents", admin, async (request, reply) => {
    const parsed = documentSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Bad Request");
    const made = await inCustomer(request, reply, async (tx, scope) => ({
      scope,
      row: (
        await tx
          .insert(customerDocuments)
          .values({
            accountId: scope.accountId,
            customerId: scope.customerId,
            s3Key: parsed.data.s3Key,
            filename: encryptText(parsed.data.filename, dataKey),
            mime: parsed.data.mime,
            sizeBytes: parsed.data.sizeBytes,
          })
          .returning({ id: customerDocuments.id })
      )[0],
    }));
    if (made === undefined) return reply;
    if (made.row === undefined) return problem(reply, 500, "Internal Server Error");
    await audited(made.scope.accountId, request, made.row.id);
    return reply.code(201).send({ id: made.row.id });
  });

  app.delete("/v1/customers/:id/documents/:documentId", admin, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const gone = await inCustomer(request, reply, async (tx, scope) => {
      const removed = await tx
        .delete(customerDocuments)
        .where(
          and(
            eq(customerDocuments.id, documentId),
            eq(customerDocuments.customerId, scope.customerId),
          ),
        )
        .returning({ id: customerDocuments.id });
      if (removed.length === 0) return false;
      await tx.delete(customerChunks).where(eq(customerChunks.sourceId, documentId));
      return true;
    });
    if (gone === undefined) return reply;
    if (!gone) return problem(reply, 404, "Not Found");
    return reply.code(204).send();
  });

  /** same honesty as the dream trigger: "triggered" or "recorded", never pretend */
  app.post("/v1/customers/:id/sync", admin, async (request, reply) => {
    // appartenenza dentro il muro; il trigger HTTP del runner resta fuori
    const scope = await inCustomer(request, reply, (_tx, found) => Promise.resolve(found));
    if (scope === undefined) return reply;
    if (deps.syncTriggerUrl === undefined) {
      return reply.code(202).send({
        status: "recorded",
        detail: "runner non configurato: le fonti si aggiornano al prossimo giro schedulato",
      });
    }
    try {
      const response = await fetch(deps.syncTriggerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "customer_sync", customerId: scope.customerId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`status ${String(response.status)}`);
      return await reply.code(202).send({ status: "triggered" });
    } catch (error) {
      request.log.warn({ err: String(error) }, "customer sync trigger unreachable");
      return reply.code(202).send({
        status: "recorded",
        detail: "runner non raggiungibile: le fonti si aggiornano al prossimo giro schedulato",
      });
    }
  });
}

function safeDecrypt(value: string, key: Buffer): string {
  try {
    return decryptText(value, key);
  } catch {
    return "[non decifrabile con la chiave corrente]";
  }
}
