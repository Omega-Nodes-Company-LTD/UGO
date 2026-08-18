import { desires, type DbClient } from "@ugo/db";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { voiceTimer, type TimerKind } from "./timers.js";

/**
 * Chi fa suonare il timer (ADR-078).
 *
 * Esiste per una ragione sola, ed è tutta la differenza fra un timer e un
 * promemoria: **la puntualità**. L'iniziativa (ADR-027) gira ogni quattro
 * minuti e sceglie il momento buono, il che per «ricordami di chiamare la
 * banca» va benissimo e per la pasta è inutile. Questa gira ogni quindici
 * secondi e non sceglie niente.
 *
 * Non tiene niente in memoria: nessun `setTimeout`, nessuna coda. La verità è
 * la riga sul database con l'ora sopra, quindi un riavvio non perde una
 * sveglia — al massimo la fa suonare con qualche secondo di ritardo, che è
 * esattamente ciò che farebbe una sveglia vera senza corrente per un attimo.
 */

const RINGING: readonly TimerKind[] = ["timer", "sveglia"];

export interface TimerWatchDeps {
  db: DbClient;
  /** chi parla: la stessa porta da cui esce un promemoria */
  gateway: { broadcastSpeak: (text: string) => void };
  gosinoId: string;
}

export class TimerWatch {
  public constructor(private readonly deps: TimerWatchDeps) {}

  /** Quanti ne ha fatti suonare. */
  public async tick(at: Date = new Date()): Promise<number> {
    const due = await this.deps.db
      .select({ id: desires.id, kind: desires.kind, text: desires.text })
      .from(desires)
      .where(
        and(
          eq(desires.gosinoId, this.deps.gosinoId),
          eq(desires.status, "pending"),
          inArray(desires.kind, [...RINGING]),
          lte(desires.dueAt, at),
        ),
      )
      .orderBy(asc(desires.dueAt));

    let rang = 0;
    for (const row of due) {
      if (row.kind !== "timer" && row.kind !== "sveglia") continue;
      /**
       * Segnato PRIMA di suonare. Se l'ordine fosse l'inverso, un errore fra
       * la voce e la scrittura lascerebbe la riga in `pending` e il timer
       * suonerebbe di nuovo fra quindici secondi, per sempre: una sveglia che
       * non si spegne è il difetto peggiore che questa cosa possa avere.
       */
      await this.deps.db.update(desires).set({ status: "done" }).where(eq(desires.id, row.id));
      /**
       * E suona **anche a iniziativa spenta**. Spegnere l'iniziativa vuol dire
       * «non attaccare discorso», non «dimentica la sveglia che ti ho chiesto
       * io»: è un ordine con un'ora sopra, non una cosa che gli è venuta in
       * mente.
       */
      this.deps.gateway.broadcastSpeak(voiceTimer(row.kind, row.text));
      rang += 1;
    }
    return rang;
  }
}
