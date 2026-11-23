import { accounts, events, latestMigrationTag, type DbClient } from "@ugo/db";
import {
  SOUL_ARCHIVE_FORMAT_MAJOR,
  SOUL_ARCHIVE_FORMAT_MINOR,
  assessCompatibility,
  openSoulArchive,
} from "@ugo/shared";
import { eq } from "drizzle-orm";
import { createAuditLog } from "../auditLog.js";
import { issueToken } from "../tenantAuth.js";
import { readCatalogue } from "./catalogue.js";
import { ImportRefusal } from "./errors.js";
import { importTable } from "./importTable.js";
import { clearPristineSeed } from "./seed.js";
import type { ImportDeps, ImportOptions, ImportReport, ImportState } from "./types.js";

export type { ImportDeps, ImportOptions, ImportReport, TableReport } from "./types.js";

/**
 * «A casa tua», l'importatore (ADR-132, MKT-10.5): una `.ugosoul` in
 * un'installazione che ha solo il seme.
 *
 * **Una transazione sola, e si conferma solo a lettura finita.** Il record
 * d'integrità sta in fondo al file, quindi tutto ciò che si scrive prima è
 * provvisorio: se l'archivio è manomesso, tagliato o incoerente, il ciclo sulle
 * tabelle solleva e il rollback lascia il database com'era (il seme, e basta).
 * Mai una casa a metà.
 *
 * Non fonde mai (vedi `seed.ts`), non crea niente di nuovo (gli id sono quelli
 * dell'archivio: è la stessa creatura), e non porta con sé diritti: la casa
 * nasce senza fondare né allevare (regola 14).
 */
export async function importSoulArchive(
  db: DbClient,
  deps: ImportDeps,
  source: AsyncIterable<Uint8Array>,
  secret: string,
  options: ImportOptions = {},
): Promise<ImportReport> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as DbClient;
    const archive = await openSoulArchive(source, secret);
    const verdict = assessCompatibility(archive.manifest, {
      supportedMajor: SOUL_ARCHIVE_FORMAT_MAJOR,
      supportedMinor: SOUL_ARCHIVE_FORMAT_MINOR,
      schemaVersion: latestMigrationTag(),
      embeddingModel: deps.embeddingModel,
    });
    if (!verdict.ok) throw new ImportRefusal("incompatible", verdict.message);
    const catalogue = await readCatalogue(tx);
    await clearPristineSeed(tx, catalogue);

    const state: ImportState = {
      tx,
      deps,
      options,
      catalogue,
      known: new Map(),
      seen: new Set(),
      expected: new Map(),
      report: {
        accountId: "",
        gosinoIds: [],
        ownerToken: "",
        manifest: archive.manifest,
        warnings: verdict.warnings,
        tables: [],
        nulledReferences: [],
        ignoredColumns: [],
        ignoredTables: [],
        embeddings: { computed: 0, pending: 0 },
      },
    };
    for await (const stream of archive.tables) await importTable(state, stream);

    // reaching here means the integrity record matched: only now is it a house
    const accountId = state.accountId;
    const firstCreature = state.report.gosinoIds[0];
    if (accountId === undefined) throw new ImportRefusal("no-house", "the archive carries no house");
    if (firstCreature === undefined) throw new ImportRefusal("no-house", "the archive carries no creature");
    const declared = new Map(archive.integrity().files.map((file) => [file.name, file.rows]));
    for (const table of state.report.tables) {
      if (table.inserted + table.skipped !== declared.get(`tables/${table.table}.ndjson`)) {
        throw new ImportRefusal("mismatch", `table ${table.table}: rows written do not add up to the archive's`);
      }
    }

    if (options.dailyBudgetUsd !== undefined) {
      await tx
        .update(accounts)
        .set({ dailyBudgetUsd: options.dailyBudgetUsd.toFixed(4) })
        .where(eq(accounts.id, accountId));
    }
    const owner = await issueToken(tx, { accountId, role: "owner", label: options.ownerLabel ?? "importazione" });
    // provenance: ids and numbers only — never a name, a text or a key
    await tx.insert(events).values({
      gosinoId: firstCreature,
      source: "system",
      type: "soul_imported",
      payload: {
        mode: archive.manifest.mode,
        formatVersion: archive.manifest.formatVersion,
        sourceSchemaVersion: archive.manifest.source.schemaVersion,
        tables: state.report.tables.length,
        skippedRows: state.report.tables.reduce((sum, t) => sum + t.skipped, 0),
        embeddingsPending: state.report.embeddings.pending,
      },
    });
    await createAuditLog(tx).record(
      { verb: "soul_import", outcome: "ok", accountId, resourceType: "account", resourceId: accountId },
      tx,
    );
    return { ...state.report, accountId, ownerToken: owner.token };
  });
}
