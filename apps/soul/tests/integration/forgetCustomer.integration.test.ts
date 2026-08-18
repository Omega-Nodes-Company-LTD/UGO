import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  createDbClient,
  customerDocuments,
  customerMessages,
  customers,
  type DbClient,
  runMigrations,
  tickets,
} from "@ugo/db";
import { startMinio, startPostgres, type MinioHandle } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AudioStorageConfig } from "../../src/routes/audio.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { buildServer } from "../../src/server.js";

/**
 * L'oblio di un cliente (ADR-093), su Postgres E MinIO veri.
 *
 * ADR-052 prometteva «l'oblio è il cascade», e il cascade c'era — ma non
 * esisteva la rotta (una richiesta GDPR si evadeva a mano su psql) e il
 * cascade **non tocca il bucket**: i PDF del cliente restavano nell'object
 * storage, orfani e integri, senza che nessuno potesse più accorgersene.
 * Le due cose che solo un'infrastruttura vera può provare: che l'oggetto
 * **non è più nel bucket** dopo, e che un oblio impossibile da completare
 * si rifiuta invece di riuscire a metà.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);
const BUCKET = "ugo-docs-test";

let pg: StartedPostgreSqlContainer;
let minio: MinioHandle;
let db: DbClient;
let app: FastifyInstance;
let token: string;
let accountId: string;
let gosinoId: string;
let storage: AudioStorageConfig;
let s3: S3Client;

const forget = (id: string, confirmName: string, useToken = token) =>
  app.inject({
    method: "DELETE",
    url: `/v1/customers/${id}`,
    headers: { authorization: `Bearer ${useToken}`, "content-type": "application/json" },
    payload: JSON.stringify({ confirmName }),
  });

/** Un cliente col suo mondo: un ticket, un messaggio e un PDF nel bucket. */
const seedCustomer = async (slug: string, name: string): Promise<{ id: string; key: string }> => {
  const [customer] = await db
    .insert(customers)
    .values({ accountId, name, slug, notes: encryptText("nota privata", DATA_KEY) })
    .returning({ id: customers.id });
  if (customer === undefined) throw new Error("no customer");
  const [ticket] = await db
    .insert(tickets)
    .values({
      accountId,
      customerId: customer.id,
      gosinoId,
      title: encryptText("il sito è giù", DATA_KEY),
      body: encryptText("da stamattina", DATA_KEY),
    })
    .returning({ id: tickets.id });
  if (ticket === undefined) throw new Error("no ticket");
  await db.insert(customerMessages).values({
    accountId,
    customerId: customer.id,
    gosinoId,
    ticketId: ticket.id,
    role: "customer",
    text: encryptText("aiuto", DATA_KEY),
  });
  const key = `docs/${slug}/contratto.pdf`;
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from("PDF-finto") }),
  );
  await db.insert(customerDocuments).values({
    accountId,
    customerId: customer.id,
    s3Key: key,
    filename: encryptText("contratto.pdf", DATA_KEY),
    mime: "application/pdf",
  });
  return { id: customer.id, key };
};

const objectExists = async (key: string): Promise<boolean> => {
  try {
    await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
};

beforeAll(async () => {
  const [started, startedMinio] = await Promise.all([startPostgres(), startMinio()]);
  pg = started.container;
  minio = startedMinio;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  storage = {
    endpoint: minio.endpoint,
    accessKey: minio.accessKey,
    secretKey: minio.secretKey,
    bucket: BUCKET,
    region: "us-east-1",
  };
  s3 = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
    forcePathStyle: true,
  });
  const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));

  const account = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "studio-oblio",
    name: "Studio",
    gosinoName: "Ugo",
  });
  token = account.ownerToken;
  accountId = account.accountId;
  gosinoId = account.gosinoId;

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: "operatore",
      gosini: { dataKey: DATA_KEY },
      customers: { dataKey: DATA_KEY, docsStorage: storage },
    },
  });
  await app.ready();
}, 300_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await Promise.all([pg.stop(), minio.container.stop()]);
});

describe("l'oblio di un cliente", () => {
  it("il nome sbagliato non cancella niente: un click solo non è un consenso", async () => {
    const rossi = await seedCustomer("rossi", "Officina Rossi");
    const wrong = await forget(rossi.id, "Officina Sbagliata");
    expect(wrong.statusCode).toBe(400);
    expect(await db.select().from(customers).where(eq(customers.id, rossi.id))).toHaveLength(1);
    expect(await objectExists(rossi.key)).toBe(true);

    // il nome giusto, con spazi e maiuscole diversi: una tastiera li sbaglia
    const response = await forget(rossi.id, "  officina ROSSI ");
    expect(response.statusCode).toBe(200);
    const report = response.json<{ documentsFound: number; objectsDeleted: number; erased: boolean }>();
    expect(report).toEqual({ documentsFound: 1, objectsDeleted: 1, erased: true });
  });

  it("dopo: niente righe, e NIENTE oggetto nel bucket — il cascade da solo lo lasciava lì", async () => {
    const rows = await db.select().from(customers);
    expect(rows).toHaveLength(0);
    const docs = await db.select().from(customerDocuments);
    expect(docs).toHaveLength(0);
    const messages = await db.select().from(customerMessages);
    expect(messages).toHaveLength(0);
    // il punto dell'ADR: l'oggetto è sparito DAVVERO dallo storage
    expect(await objectExists("docs/rossi/contratto.pdf")).toBe(false);
  });

  it("e la riga di audit c'è, con l'id e mai il nome", async () => {
    const { auditLog } = await import("@ugo/db");
    const trail = await db.select().from(auditLog).where(eq(auditLog.verb, "customer_forgotten"));
    expect(trail).toHaveLength(1);
    expect(trail[0]?.outcome).toBe("ok");
    expect(JSON.stringify(trail)).not.toContain("Rossi");
  });

  it("il vicino non dimentica i clienti altrui, e non scopre che esistono", async () => {
    const bianchi = await seedCustomer("bianchi", "Bar Bianchi");
    const other = await createAccountWithFounder(db, MASTER_KEY, {
      slug: "vicino-oblio",
      name: "Vicino",
      gosinoName: "Altro",
    });
    const response = await forget(bianchi.id, "Bar Bianchi", other.ownerToken);
    expect(response.statusCode).toBe(404);
    expect(await objectExists(bianchi.key)).toBe(true);
  });
});
