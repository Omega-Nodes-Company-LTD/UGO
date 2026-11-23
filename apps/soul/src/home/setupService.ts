import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { accounts, latestMigrationTag, PRIME_ACCOUNT_ID, type DbClient } from "@ugo/db";
import { OpenRouterEmbeddingsClient } from "@ugo/memory";
import { ArchiveError } from "@ugo/shared";
import { ne } from "drizzle-orm";
import { ImportRefusal } from "../services/soulImport/errors.js";
import { importSoulArchive, type ImportReport } from "../services/soulImport/importSoul.js";
import { inspectSoulArchive, type ArchiveInspection } from "../services/soulImport/inspect.js";
import { HomeSecrets } from "./secrets.js";

/**
 * La procedura guidata, senza HTTP (ADR-132 §2, MKT-10.6): carica → ispeziona →
 * installa. Le rotte sono un guscio sottile sopra questa classe, così tutto ciò
 * che conta si prova contro un database vero senza un server in mezzo.
 *
 * Tre stati, e uno solo di ritorno:
 *  - `fresh`      c'è solo il seme: si può installare;
 *  - `needs-key`  la casa è entrata ma la chiave non è stata scritta (uno
 *                 spegnimento nel momento sbagliato): resta solo l'ultimo passo;
 *  - `ready`      casa e chiave ci sono: il setup non risponde più.
 * Non c'è un modo di tornare a `fresh`: un setup che si può rilanciare sopra una
 * casa vera sarebbe un modo di perderla.
 */
export type InstallState = "fresh" | "needs-key" | "ready";

export class SetupRefusal extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SetupRefusal";
  }
}

export interface SetupConfig {
  /** la connessione che vede tutte le case (l'owner): l'importatore non lavora sotto RLS */
  db: DbClient;
  secrets: HomeSecrets;
  masterKey: Buffer;
  embeddingModel: string;
  providers: readonly string[];
  timezone: string;
  /** tetto alla dimensione dell'archivio in arrivo */
  maxArchiveBytes: number;
}

export interface InstallInput {
  recoveryCode: string;
  openRouterKey: string;
  dailyBudgetUsd: number;
}

/** Ciò che si mostra a fine installazione: conteggi e id, mai testi né chiavi. */
export interface InstallSummary {
  accountId: string;
  gosinoIds: string[];
  /** si mostra UNA volta: non si conserva da nessuna parte */
  ownerToken: string;
  tables: number;
  skippedRows: number;
  nulledReferences: ImportReport["nulledReferences"];
  ignoredColumns: ImportReport["ignoredColumns"];
  embeddings: ImportReport["embeddings"];
  warnings: ImportReport["warnings"];
}

const ARCHIVE_FILE = "archive.ugosoul";

export class SetupService {
  private busy = false;

  public constructor(private readonly config: SetupConfig) {}

  private get archivePath(): string {
    return join(this.config.secrets.incomingDir, ARCHIVE_FILE);
  }

  public async state(): Promise<InstallState> {
    const houses = await this.config.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(ne(accounts.id, PRIME_ACCOUNT_ID))
      .limit(1);
    if (houses.length === 0) return "fresh";
    return (await this.config.secrets.openRouterKey()) === undefined ? "needs-key" : "ready";
  }

  private async requireState(expected: InstallState): Promise<void> {
    const current = await this.state();
    if (current !== expected) {
      throw new SetupRefusal(409, current === "ready" ? "questa casa è già installata" : `passo non valido adesso (${current})`);
    }
  }

  private async single<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new SetupRefusal(409, "un'altra operazione è in corso");
    this.busy = true;
    try {
      return await work();
    } finally {
      this.busy = false;
    }
  }

  /** Mette l'archivio su disco, com'è (cifrato), contando i byte: oltre il tetto si ferma. */
  public receive(body: Readable): Promise<{ bytes: number }> {
    return this.single(async () => {
      await this.requireState("fresh");
      await mkdir(this.config.secrets.incomingDir, { recursive: true, mode: 0o700 });
      let bytes = 0;
      const cap = this.config.maxArchiveBytes;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > cap) callback(new SetupRefusal(413, "il file è più grande di quanto UGO accetti"));
          else callback(null, chunk);
        },
      });
      try {
        await pipeline(body, counter, createWriteStream(this.archivePath, { mode: 0o600 }));
      } catch (error) {
        await this.config.secrets.discardIncoming();
        throw error;
      }
      if (bytes === 0) {
        await this.config.secrets.discardIncoming();
        throw new SetupRefusal(400, "il file è vuoto");
      }
      return { bytes };
    });
  }

  private async openIncoming(): Promise<AsyncIterable<Uint8Array>> {
    try {
      await stat(this.archivePath);
    } catch {
      throw new SetupRefusal(409, "nessun file caricato: scegli prima l'archivio");
    }
    return createReadStream(this.archivePath);
  }

  /** `ArchiveError` e `ImportRefusal` hanno parole già scelte per chi le legge; il resto no. */
  private static explain(error: unknown): SetupRefusal {
    if (error instanceof SetupRefusal) return error;
    if (error instanceof ArchiveError) return new SetupRefusal(422, error.message);
    if (error instanceof ImportRefusal) return new SetupRefusal(422, error.message);
    const text = error instanceof Error ? error.message : "";
    if (/status (401|403)\b/u.test(text)) {
      return new SetupRefusal(422, "OpenRouter non accetta questa chiave: controllala e riprova");
    }
    if (/status 402\b/u.test(text)) {
      return new SetupRefusal(422, "il conto OpenRouter non ha credito: ricaricalo e riprova");
    }
    // il messaggio di un errore sconosciuto può citare valori: non lo si ripete
    return new SetupRefusal(500, "l'installazione non è riuscita; non è stato scritto nulla");
  }

  /** Legge tutto il file prima di toccare il database: dice cosa c'è e quanto costa. */
  public inspect(recoveryCode: string): Promise<ArchiveInspection> {
    return this.single(async () => {
      await this.requireState("fresh");
      const source = await this.openIncoming();
      try {
        return await inspectSoulArchive(source, recoveryCode, {
          schemaVersion: latestMigrationTag(),
          embeddingModel: this.config.embeddingModel,
        });
      } catch (error) {
        throw SetupService.explain(error);
      }
    });
  }

  /** L'importazione vera, e solo dopo la chiave: nessuna casa a metà né senza voce. */
  public install(input: InstallInput): Promise<InstallSummary> {
    return this.single(async () => {
      await this.requireState("fresh");
      const apiKey = HomeSecrets.cleanKey(input.openRouterKey);
      if (apiKey === undefined) {
        throw new SetupRefusal(422, "la chiave OpenRouter ha un carattere invisibile o non ASCII: riscrivila a mano");
      }
      const source = await this.openIncoming();
      const { providers, timezone, embeddingModel } = this.config;
      let report: ImportReport;
      try {
        report = await importSoulArchive(
          this.config.db,
          {
            masterKey: this.config.masterKey,
            embeddingModel,
            embedderFor: (tx, accountId, gosinoId) =>
              new OpenRouterEmbeddingsClient({
                db: tx,
                apiKey,
                model: embeddingModel,
                providers: [...providers],
                accountId,
                gosinoId,
                timezone,
              }),
          },
          source,
          input.recoveryCode,
          { dailyBudgetUsd: input.dailyBudgetUsd, ownerLabel: "installazione" },
        );
      } catch (error) {
        throw SetupService.explain(error);
      }
      // la casa è entrata: ora, e solo ora, la chiave dell'utente su disco
      await this.config.secrets.writeOpenRouterKey(apiKey);
      await this.config.secrets.discardIncoming();
      return {
        accountId: report.accountId,
        gosinoIds: report.gosinoIds,
        ownerToken: report.ownerToken,
        tables: report.tables.length,
        skippedRows: report.tables.reduce((sum, table) => sum + table.skipped, 0),
        nulledReferences: report.nulledReferences,
        ignoredColumns: report.ignoredColumns,
        embeddings: report.embeddings,
        warnings: report.warnings,
      };
    });
  }

  /** L'ultimo passo da solo, per la casa entrata senza chiave. */
  public saveKey(rawKey: string): Promise<void> {
    return this.single(async () => {
      await this.requireState("needs-key");
      const key = HomeSecrets.cleanKey(rawKey);
      if (key === undefined) throw new SetupRefusal(422, "la chiave OpenRouter non è valida");
      await this.config.secrets.writeOpenRouterKey(key);
    });
  }
}
