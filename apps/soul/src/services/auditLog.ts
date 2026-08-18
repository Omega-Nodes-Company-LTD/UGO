import { auditLog, type AuditOutcome, type DbClient } from "@ugo/db";
import type { TenantContext } from "./tenantAuth.js";

/**
 * Chi ha fatto cosa (ADR-049).
 *
 * Un solo punto di scrittura, per la stessa ragione per cui `llmClient` è il
 * solo punto di chiamata al provider: un giornale che si scrive da sei posti
 * diversi diverge, e un audit log divergente è peggio di nessun audit log,
 * perché sembra completo.
 *
 * **Non solleva mai.** NIS2 §2 chiede degradazione graduale: il fallimento di
 * un servizio non bloccante non deve mandare giù la richiesta. Un `insert` che
 * fallisce viene registrato come warning e la richiesta prosegue — l'alternativa
 * sarebbe che un disco pieno renda impossibile cancellare una persona, cioè che
 * la conformità impedisca la conformità.
 *
 * Il prezzo di quella scelta è che un audit mancante non si nota, quindi il
 * warning esiste apposta: è l'unico posto da cui si scopre che il giornale ha
 * un buco.
 *
 * Il vocabolario dei verbi copre **ciò che il sistema sa fare oggi**, e
 * `ugo casa nuova` ha appena aggiunto i suoi due. Revoca di un token e chiusura
 * di una casa restano fuori per la stessa ragione: nessun codice le compie
 * ancora, e dichiararne il verbo sarebbe un giornale che promette righe che non
 * scriverà mai.
 */

/** Gli atti che si registrano. Chiusa: un verbo nuovo è una decisione. */
export const AUDIT_VERBS = [
  /** un token assente o non valido su una rotta protetta */
  "denied",
  /** l'intera casa consegnata in chiaro a chi l'ha chiesta (GDPR, portabilità) */
  "export",
  /** una persona cancellata dalla memoria della casa (diritto all'oblio) */
  "forget",
  /** un sogno chiesto fuori dall'orario in cui sarebbe partito da solo */
  "dream_requested",
  /** una famiglia nuova sotto lo stesso server (`ugo casa nuova`) */
  "account_created",
  /** un token emesso: nel giornale il suo id, mai il segreto */
  "token_issued",
  /** un cliente nuovo della casa (ADR-057) */
  "customer_created",
  /** un cliente archiviato: la reception gli si chiude */
  "customer_archived",
  // ADR-093: la cancellazione GDPR di un cliente — cascade + bucket. La riga
  // di audit è metà del senso dell'operazione: senza, «abbiamo cancellato X
  // il giorno Y» non si può più dire
  "customer_forgotten",
  /** un token cliente emesso: nel giornale il suo id, mai il segreto */
  "customer_token_issued",
  /** un token cliente revocato */
  "customer_token_revoked",
  /** una richiesta raccolta dalla reception (ADR-052) */
  "ticket_created",
  /** un ticket triagiato dal pannello */
  "ticket_status_changed",
  /** una fonte di conoscenza collegata a un cliente (ADR-054) */
  "customer_source_added",
  /** ADR-057: un volto ignoto ha preso un nome — chi ha insegnato cosa */
  "face_claimed",
  /** un'impronta ignota distrutta dal pannello, una per una */
  "print_destroyed",
  /** le impronte ignote scadute, portate via dalla retention */
  "prints_expired",
  /** ADR-058: una mela data da un cliente — il gosino premiato, mai il testo */
  "customer_reward_given",
  /** ADR-060: la casa si è iscritta a un feed */
  "feed_added",
  /** ADR-060: un feed disdetto — il cascade porta via anche gli item */
  "feed_removed",
  // ADR-091: rimettere in chiaro i ricordi cifrati tocca il testo di ogni
  // riga di una casa. Se una cosa del genere non lascia traccia, non è mai
  // successa per chi legge il giornale dopo
  "memories_plaintext",
] as const;
export type AuditVerb = (typeof AUDIT_VERBS)[number];

export interface AuditEntry {
  verb: AuditVerb;
  outcome: AuditOutcome;
  /** assente su un rifiuto: non si sa ancora di che casa si parli */
  accountId?: string | undefined;
  /** chi ha chiesto, se il token diceva qualcosa */
  actor?: TenantContext | null | undefined;
  resourceType?: string | undefined;
  /**
   * L'id della risorsa, o la rotta per un rifiuto.
   *
   * **Mai un nome, mai un testo, mai un segreto** (regola 6, e SECURITY §2: i
   * log devono permettere la ricostruzione forense senza contenere PII). È la
   * sola colonna in cui qualcuno potrebbe essere tentato di scriverne uno, e
   * per questo è l'unica con questo commento.
   */
  resourceId?: string | undefined;
}

export interface AuditLogger {
  /**
   * ADR-062: `on` è la transazione di `inAccount`, quando c'è. Il giornale
   * resta UN punto di scrittura — cambia solo su quale connessione scrive:
   * sotto `ugo_app` una riga attribuita a una casa passa il `WITH CHECK`
   * soltanto dentro la transazione che ha dichiarato quella casa.
   */
  record: (entry: AuditEntry, on?: DbClient) => Promise<void>;
}

export function createAuditLog(
  db: DbClient,
  logger?: { warn: (data: Record<string, unknown>, message: string) => void },
): AuditLogger {
  return {
    async record(entry: AuditEntry, on?: DbClient): Promise<void> {
      try {
        await (on ?? db).insert(auditLog).values({
          verb: entry.verb,
          outcome: entry.outcome,
          accountId: entry.accountId ?? entry.actor?.accountId ?? null,
          tokenId: entry.actor?.tokenId ?? null,
          role: entry.actor?.role ?? null,
          resourceType: entry.resourceType ?? null,
          resourceId: entry.resourceId ?? null,
        });
      } catch (error) {
        // il verbo sì, l'errore no: un messaggio di Postgres può contenere il
        // valore della riga che ha rifiutato, e questa riga finisce nei log
        logger?.warn(
          { verb: entry.verb, reason: error instanceof Error ? error.name : "unknown" },
          "audit log write failed: the journal has a hole",
        );
        // DENTRO una transazione l'errore NON si inghiotte: in Postgres un
        // errore avvelena la transazione, il commit diventa rollback, e la
        // rotta risponderebbe 200 su un lavoro che il database ha buttato —
        // visto in CI su /v1/prints/expire (destroyed: 1, riga ancora lì).
        // Il buco nel giornale è tollerato solo nel percorso fire-and-forget
        if (on !== undefined) throw error;
      }
    },
  };
}
