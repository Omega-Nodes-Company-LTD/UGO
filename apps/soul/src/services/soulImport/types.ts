import type { DbClient } from "@ugo/db";
import type { EmbeddingsClient } from "@ugo/memory";
import type { CompatWarning, SoulManifest } from "@ugo/shared";
import type { TargetCatalogue } from "./catalogue.js";

export interface ImportDeps {
  /** `UGO_DATA_KEY` di QUESTA installazione: ricifra i testi, avvolge le chiavi nuove */
  masterKey: Buffer;
  /** il modello con cui i vettori si ricalcolano */
  embeddingModel: string;
  /**
   * Costruisce il client degli embedding sulla transazione dell'import, così
   * la spesa si scrive sul registro della casa NUOVA (che prima del commit
   * esiste solo qui dentro).
   */
  embedderFor?: (tx: DbClient, accountId: string, gosinoId: string) => EmbeddingsClient;
}

export interface ImportOptions {
  dailyBudgetUsd?: number;
  /** non ricalcolare i vettori adesso (i ricordi restano senza ricerca semantica) */
  skipEmbeddings?: boolean;
  ownerLabel?: string;
}

export interface TableReport {
  table: string;
  inserted: number;
  /** righe che non possono esistere qui (un riferimento obbligatorio a una riga assente) */
  skipped: number;
}

export interface ImportReport {
  accountId: string;
  gosinoIds: string[];
  /** il token del proprietario della casa nuova: si mostra una volta, non si conserva */
  ownerToken: string;
  manifest: SoulManifest;
  warnings: CompatWarning[];
  tables: TableReport[];
  /** colonne di riferimenti messe a NULL perché la riga puntata non era nell'archivio */
  nulledReferences: { table: string; column: string; rows: number }[];
  /** colonne dell'archivio che questa installazione non conosce, scartate */
  ignoredColumns: { table: string; column: string }[];
  /** tabelle dell'archivio che questa installazione non ha più */
  ignoredTables: string[];
  embeddings: { computed: number; pending: number };
}

/** The importer's working state, shared by the steps of one import. */
export interface ImportState {
  tx: DbClient;
  deps: ImportDeps;
  options: ImportOptions;
  catalogue: TargetCatalogue;
  /** primary keys already imported, for the tables something points at */
  known: Map<string, Set<string>>;
  seen: Set<string>;
  /** a table whose parent has not arrived yet: parent → the child that was waiting */
  expected: Map<string, string>;
  accountId?: string;
  embedder?: EmbeddingsClient;
  report: ImportReport;
}
