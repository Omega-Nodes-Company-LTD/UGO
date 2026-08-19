/**
 * Dove se ne va il tempo, e quante frasi non sono mai diventate una risposta.
 *
 * Il difetto che questo file chiude non era nel codice: era nel **non poterlo
 * vedere**. Davanti a «ci mette più di un minuto a rispondere» e «ne prende
 * una su venti» non c'era una sola misura da guardare — né quanto fosse
 * durato un turno, né quale pezzo se lo fosse mangiato, né quante frasi
 * fossero arrivate a soul rispetto a quante ne fossero uscite. La diagnosi
 * cominciava e finiva leggendo il codice.
 *
 * Due domande, due strumenti, e sono diversi apposta:
 *
 * 1. **il cronometro** — l'ultimo turno spezzato in fasi. Dice se il minuto se
 *    lo prende il modello, il ripescaggio o il database, e sono tre guasti
 *    diversi con tre rimedi diversi;
 * 2. **i contatori** — quante frasi sono ENTRATE dal muso e quante ne sono
 *    uscite come risposta. È l'unico modo di sapere se le diciannove frasi
 *    perse muoiono nel browser (non arrivano proprio) o qui dentro.
 *
 * In memoria e basta: sono numeri di esercizio, non memoria della creatura, e
 * al riavvio ripartono da zero senza che nessuno debba cancellare niente.
 * Nessun testo, nessun `beingId`, nessun contenuto — solo id e millisecondi
 * (regola 6: niente PII nei log, e questo è un log).
 */

/** Quanti turni si tengono. Venti = l'ultima mezz'ora di una conversazione. */
const KEEP = 20;

export interface TurnStage {
  /** nome della fase, in italiano: è il pannello che lo legge */
  name: string;
  ms: number;
}

export interface TurnSample {
  at: string;
  /** quale esemplare ha risposto; mai chi gli ha parlato */
  gosinoId: string;
  channel: string;
  totalMs: number;
  stages: TurnStage[];
}

export interface TurnCounters {
  /** frasi arrivate dal muso (`heard_text`) */
  heard: number;
  /** frasi rifiutate dal contratto prima di toccare qualunque logica */
  refused: number;
  /** frasi che sono diventate una risposta */
  answered: number;
  /** frasi morte in un errore lungo la strada */
  failed: number;
}

export interface TurnLogSnapshot {
  counters: TurnCounters;
  /** dal più recente al più vecchio */
  turns: TurnSample[];
  /** mediana dei turni tenuti; `null` finché non ne è passato uno */
  medianMs: number | null;
  /** il peggiore fra quelli tenuti; `null` finché non ne è passato uno */
  slowestMs: number | null;
}

/**
 * Un cronometro aperto su un turno.
 *
 * `lap` chiude la fase precedente e ne apre una nuova, così chi misura non
 * deve tenere il conto degli istanti: una fase è il tempo fra due `lap`, e
 * dimenticarne uno si vede subito perché la somma non torna col totale.
 */
export class TurnClock {
  private readonly started: number;
  private last: number;
  private readonly stages: TurnStage[] = [];

  public constructor(
    private readonly log: TurnLog,
    private readonly gosinoId: string,
    private readonly channel: string,
    private readonly now: () => number,
  ) {
    this.started = now();
    this.last = this.started;
  }

  public lap(name: string): void {
    const at = this.now();
    this.stages.push({ name, ms: Math.round(at - this.last) });
    this.last = at;
  }

  /** Chiude il turno e lo consegna al registro. */
  public done(): void {
    this.log.record({
      at: new Date().toISOString(),
      gosinoId: this.gosinoId,
      channel: this.channel,
      totalMs: Math.round(this.now() - this.started),
      stages: this.stages,
    });
  }
}

export class TurnLog {
  private readonly samples: TurnSample[] = [];
  private readonly counters: TurnCounters = { heard: 0, refused: 0, answered: 0, failed: 0 };

  /**
   * @param now l'orologio monotono. Iniettato perché un test che misura il
   *            tempo con l'orologio vero misura la macchina su cui gira.
   */
  public constructor(private readonly now: () => number = () => performance.now()) {}

  public start(gosinoId: string, channel: string): TurnClock {
    return new TurnClock(this, gosinoId, channel, this.now);
  }

  public record(sample: TurnSample): void {
    this.samples.unshift(sample);
    if (this.samples.length > KEEP) this.samples.length = KEEP;
  }

  public heard(): void {
    this.counters.heard += 1;
  }

  public refused(): void {
    this.counters.refused += 1;
  }

  public answered(): void {
    this.counters.answered += 1;
  }

  public failed(): void {
    this.counters.failed += 1;
  }

  public snapshot(): TurnLogSnapshot {
    const times = this.samples.map((s) => s.totalMs).sort((a, b) => a - b);
    const middle = times[Math.floor((times.length - 1) / 2)];
    return {
      counters: { ...this.counters },
      turns: [...this.samples],
      medianMs: middle ?? null,
      slowestMs: times.length === 0 ? null : (times[times.length - 1] ?? null),
    };
  }
}
