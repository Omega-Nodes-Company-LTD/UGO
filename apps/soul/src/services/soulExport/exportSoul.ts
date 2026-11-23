import { accounts, gosini, latestMigrationTag, type DbClient } from "@ugo/db";
import {
  SOUL_ARCHIVE_FORMAT_MAJOR,
  SOUL_ARCHIVE_FORMAT_MINOR,
  unwrapDataKey,
  writeSoulArchive,
  type SoulManifest,
  type TableInput,
} from "@ugo/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { planExport, type PlannedTable } from "./plan.js";
import { KeyRing, openRow } from "./rowCrypto.js";
import { readTableRows } from "./tableReader.js";

/**
 * The writer of a `.ugosoul` (ADR-132, MKT-10.3): reads one house's chosen
 * creatures out of the database, decrypts what the policy says to decrypt,
 * and streams the archive to a sink.
 *
 * It only reads. It runs in a single **read-only, repeatable-read**
 * transaction, so every table is the same instant and nothing can be changed by
 * a bug here; and the transaction is the house's (`app.account_id`), so the
 * database's row-level security is a second wall behind the SQL filters.
 *
 * The sink takes chunks and may await: a slow download slows the read instead
 * of buffering the archive in memory.
 */
export interface ExportRequest {
  accountId: string;
  /** the creatures that move; all must be alive and belong to the house */
  gosinoIds: readonly string[];
  /** ADR-132 §1 */
  mode: "trasloco" | "copia";
  /** a recovery code or a chosen passphrase */
  secret: string;
}

export interface ExportDeps {
  /** `UGO_DATA_KEY`: unwraps the house and creature keys */
  masterKey: Buffer;
  generatorVersion: string;
  embeddingModel: string;
  embeddingDimensions: number;
  /** tests only: the production cost is the default */
  kdf?: { log2N: number; r: number; p: number };
  /** tests only: small chunks make a small archive span several, which is where truncation and tampering live */
  chunkLog2?: number;
}

export interface ExportSummary {
  /** per exported table: how many rows (never their content) */
  tables: { table: string; rows: number }[];
  omissions: number;
  archiveBytes: number;
}

export type RefusalCode = "no-creatures" | "unknown-creature" | "retired-creature";

export class ExportRefusal extends Error {
  public constructor(
    public readonly code: RefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "ExportRefusal";
  }
}

async function checkCreatures(tx: DbClient, request: ExportRequest): Promise<void> {
  if (request.gosinoIds.length === 0) throw new ExportRefusal("no-creatures", "no creature chosen");
  const rows = await tx
    .select({ id: gosini.id, retiredAt: gosini.retiredAt })
    .from(gosini)
    .where(and(eq(gosini.accountId, request.accountId), inArray(gosini.id, [...request.gosinoIds])));
  const found = new Map(rows.map((row) => [row.id, row.retiredAt]));
  for (const id of request.gosinoIds) {
    if (!found.has(id)) throw new ExportRefusal("unknown-creature", "creature not in this house");
    if (found.get(id) !== null) {
      // a creature that has gone cannot move (its inner key may be destroyed by
      // design, ADR-075). Its data stays reachable through the GDPR export, ADR-089
      throw new ExportRefusal("retired-creature", "a retired creature cannot be exported");
    }
  }
}

async function loadKeyRing(tx: DbClient, masterKey: Buffer, request: ExportRequest): Promise<KeyRing> {
  const keys: Buffer[] = [masterKey];
  const wrapped: (Buffer | null)[] = [];
  const [house] = await tx
    .select({ wrapped: accounts.wrappedDataKey })
    .from(accounts)
    .where(eq(accounts.id, request.accountId));
  wrapped.push(house?.wrapped ?? null);
  const creatures = await tx
    .select({ wrapped: gosini.wrappedSoulKey })
    .from(gosini)
    .where(inArray(gosini.id, [...request.gosinoIds]));
  for (const creature of creatures) wrapped.push(creature.wrapped);
  for (const blob of wrapped) {
    if (blob === null) continue;
    try {
      keys.push(unwrapDataKey(blob, masterKey));
    } catch {
      // a key that does not open is reported by the first value that needs it
    }
  }
  return new KeyRing(keys);
}

export async function exportSoulArchive(
  db: DbClient,
  deps: ExportDeps,
  request: ExportRequest,
  sink: (chunk: Buffer) => Promise<void>,
): Promise<ExportSummary> {
  return db.transaction(
    async (rawTx) => {
      const tx = rawTx as unknown as DbClient;
      // isolation is already set by `begin`; the house must be the first query
      await tx.execute(sql`select set_config('app.account_id', ${request.accountId}, true)`);
      await checkCreatures(tx, request);
      const ring = await loadKeyRing(tx, deps.masterKey, request);
      const plan = await planExport(tx, {
        accountId: request.accountId,
        gosinoIds: request.gosinoIds,
      });

      const manifest: SoulManifest = {
        kind: "ugo-soul",
        formatVersion: { major: SOUL_ARCHIVE_FORMAT_MAJOR, minor: SOUL_ARCHIVE_FORMAT_MINOR },
        createdAt: new Date().toISOString(),
        generator: { name: "ugo-soul", version: deps.generatorVersion },
        mode: request.mode,
        source: {
          schemaVersion: latestMigrationTag(),
          embeddingModel: deps.embeddingModel,
          embeddingDimensions: deps.embeddingDimensions,
        },
        gosinoIds: [...request.gosinoIds],
        omissions: plan.omissions,
      };

      const rowCounts = new Map<string, number>();
      async function* lines(planned: PlannedTable): AsyncGenerator<Buffer> {
        for await (const rows of readTableRows(tx, planned.table, planned.where, planned.drop)) {
          const text = rows
            .map((row) => JSON.stringify(openRow(planned.table, planned.policy, ring, row)) + "\n")
            .join("");
          rowCounts.set(planned.table, (rowCounts.get(planned.table) ?? 0) + rows.length);
          yield Buffer.from(text, "utf8");
        }
      }
      function* tables(): Generator<TableInput> {
        for (const planned of plan.included) {
          rowCounts.set(planned.table, 0);
          yield { table: planned.table, data: lines(planned) };
        }
      }

      let archiveBytes = 0;
      for await (const chunk of writeSoulArchive({
        manifest,
        tables: tables(),
        secret: request.secret,
        ...(deps.kdf !== undefined && { kdf: deps.kdf }),
        ...(deps.chunkLog2 !== undefined && { chunkLog2: deps.chunkLog2 }),
      })) {
        archiveBytes += chunk.length;
        await sink(chunk);
      }
      return {
        tables: [...rowCounts.entries()].map(([table, rows]) => ({ table, rows })),
        omissions: plan.omissions.length,
        archiveBytes,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
