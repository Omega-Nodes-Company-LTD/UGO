import { checkins, desires, gosini, type DbClient } from "@ugo/db";
import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { houseClock } from "./houseClock.js";
import type { StandingCheckin } from "./volition/checkins.js";

/**
 * Il check-in (ADR-085): chi tiene il calendario delle domande che tornano.
 *
 * Il mestiere di questa classe è **una conversione, non una voce**: quando è
 * l'ora, la regola diventa un desiderio, e da lì parla l'iniziativa (ADR-027)
 * con tutto ciò che si porta dietro — le ore di quiete, il fatto che qualcuno
 * ci sia, l'interruttore. È la differenza fra farsi vivi e suonare: il timer
 * (ADR-078) suona anche a iniziativa spenta perché è un ordine con un'ora
 * sopra; questo tace, perché «attaccare discorso» è esattamente ciò che quel
 * l'interruttore spegne.
 *
 * Due cose che sembrano dettagli e non lo sono:
 *
 * 1. **una volta al giorno**, e la prova è una data sul database — non un
 *    timestamp, non una variabile: un riavvio alle nove e un secondo non
 *    deve poter far ripartire la giornata da capo;
 * 2. **chi non c'è più non chiede niente**: un esemplare congedato (ADR-075)
 *    esce dal giro, e le sue domande smettono con lui.
 */

export interface CheckinWatchDeps {
  db: DbClient;
  gosinoId: string;
  /** il fuso della casa: «le nove di sera» è un'ora di casa, non del server */
  timezone?: string;
}

export interface CheckinReport {
  /** quante domande sono diventate un desiderio in questo giro */
  asked: number;
}

export class CheckinWatch {
  public constructor(private readonly deps: CheckinWatchDeps) {}

  public async tick(at: Date = new Date()): Promise<CheckinReport> {
    const [alive] = await this.deps.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.id, this.deps.gosinoId), isNull(gosini.retiredAt)));
    if (alive === undefined) return { asked: 0 };

    const now = houseClock(at, this.deps.timezone);
    const due = await this.deps.db
      .select({
        id: checkins.id,
        question: checkins.question,
        hour: checkins.hour,
        minute: checkins.minute,
        weekday: checkins.weekday,
      })
      .from(checkins)
      .where(
        and(
          eq(checkins.gosinoId, this.deps.gosinoId),
          eq(checkins.enabled, true),
          or(isNull(checkins.weekday), eq(checkins.weekday, now.weekday)),
          // già chiesta oggi: non si richiede. `is null` compreso, che è il
          // primo giorno di ogni check-in appena messo
          or(isNull(checkins.lastAskedOn), ne(checkins.lastAskedOn, now.date)),
        ),
      )
      .orderBy(asc(checkins.hour), asc(checkins.minute));

    let asked = 0;
    for (const row of due) {
      if (now.hour * 60 + now.minute < row.hour * 60 + row.minute) continue;
      /**
       * Segnata PRIMA di scrivere il desiderio, come suona il timer: se
       * l'ordine fosse l'inverso, un errore in mezzo lascerebbe la riga
       * libera e la stessa domanda tornerebbe al giro dopo, e poi ancora.
       * Una domanda ripetuta ogni quattro minuti non è affetto: è assillo.
       */
      const marked = await this.deps.db
        .update(checkins)
        .set({ lastAskedOn: now.date })
        .where(
          and(
            eq(checkins.id, row.id),
            or(isNull(checkins.lastAskedOn), ne(checkins.lastAskedOn, now.date)),
          ),
        )
        .returning({ id: checkins.id });
      // se non ha marcato niente, qualcun altro l'ha già chiesta: non si insiste
      if (marked.length === 0) continue;

      await this.deps.db.insert(desires).values({
        gosinoId: this.deps.gosinoId,
        text: `Ehi... ${row.question}?`,
        kind: "desiderio",
        // niente `dueAt`: un check-in non ha un istante, ha una giornata.
        // Con l'ora sopra sarebbe stato un promemoria, e i promemoria saltano
        // le ore di quiete — cioè lo avrebbe detto anche alle tre di notte
        dueHint: "oggi",
      });
      asked += 1;
    }
    return { asked };
  }
}

/** Le domande in piedi di questo esemplare, per la voce e per il pannello. */
export async function standingCheckins(
  db: DbClient,
  gosinoId: string,
): Promise<(StandingCheckin & { id: string; enabled: boolean })[]> {
  const rows = await db
    .select({
      id: checkins.id,
      question: checkins.question,
      hour: checkins.hour,
      minute: checkins.minute,
      weekday: checkins.weekday,
      enabled: checkins.enabled,
    })
    .from(checkins)
    .where(and(eq(checkins.gosinoId, gosinoId), eq(checkins.enabled, true)))
    .orderBy(asc(checkins.hour), asc(checkins.minute));
  return rows;
}

/** Quante ne ha spente. Zero è una risposta, non un errore. */
export async function silenceCheckins(db: DbClient, gosinoId: string): Promise<number> {
  const off = await db
    .delete(checkins)
    .where(and(eq(checkins.gosinoId, gosinoId), eq(checkins.enabled, true)))
    .returning({ id: checkins.id });
  return off.length;
}

/** Il massimo di domande in piedi: oltre non è cura, è una sveglia ogni ora. */
export const MAX_CHECKINS = 8;

export async function addCheckin(
  db: DbClient,
  gosinoId: string,
  input: { question: string; hour: number; minute: number; weekday: number | undefined },
): Promise<"ok" | "troppe"> {
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkins)
    .where(and(eq(checkins.gosinoId, gosinoId), eq(checkins.enabled, true)));
  if ((count?.n ?? 0) >= MAX_CHECKINS) return "troppe";
  await db.insert(checkins).values({
    gosinoId,
    question: input.question,
    hour: input.hour,
    minute: input.minute,
    ...(input.weekday !== undefined && { weekday: input.weekday }),
  });
  return "ok";
}
