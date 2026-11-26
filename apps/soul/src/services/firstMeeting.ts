import { events, gosini, messages, type DbClient } from "@ugo/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Il primo incontro (UGOMKT-11, `docs/COPIONE_PRIMO_INCONTRO.md`).
 *
 * Una creatura appena arrivata a chi la riceve non ha mai parlato con nessuno.
 * Alla prima connessione dice **una frase sola**, il saluto e la domanda
 * insieme: è la formula V3 scelta dal proprietario. Testo fisso, quindi a zero
 * token e senza chiave: il saluto non dipende dal fornitore del modello.
 *
 * Due paletti, entrambi da codice e non da buona volontà:
 *  - **una volta sola per creatura**, anche con dieci connessioni insieme
 *    (due schede, un telefono che si riconnette): la rivendicazione è
 *    atomica, sotto un lock consultivo di Postgres;
 *  - **solo chi non ha ancora una storia**: una creatura che ha già dei
 *    messaggi non è al primo incontro, qualunque cosa dica l'evento.
 */

/** Il marcatore: l'evento dice che è successo, mai cosa è stato detto (regola 6). */
export const FIRST_MEETING_EVENT = "first_meeting";

/**
 * Il saluto, per nome. Il nome della creatura sta DENTRO la frase perché è
 * quello che apre il cancello del nome del muso: senza, la risposta della
 * persona dopo il tempo della finestra non parte verso soul.
 *
 * Due frasi, parlate: niente markdown né emoji (`rules.it.md`), mai servile
 * (`identity.it.md`), e nessuna promessa di ricordare.
 */
export function firstMeetingLine(name: string): string {
  return `Grunf, piacere: io sono ${name.trim()}. Tu come ti chiami, e che cosa hai fatto oggi?`;
}

/**
 * Le frasi che la creatura non dice: promettono una memoria che il codice non
 * garantisce (il giorno dopo cita, ma è probabile e non certo). Lista chiusa,
 * usata dalle prove sulla risposta e sul congedo.
 */
const PROMISES: readonly RegExp[] = [
  /\bmi\s+ricorder[òo]/iu,
  /\bnon\s+(?:lo\s+|la\s+|ti\s+)?dimentic/iu,
  /\bme\s+(?:lo|la)\s+segno\b/iu,
  /\bdomani\s+ti\s+chieder/iu,
  /\bricorder[òo]\s+tutto/iu,
];

export function makesAPromise(text: string): boolean {
  return PROMISES.some((pattern) => pattern.test(text));
}

/**
 * La regola del primo scambio (copione §3): una riga nel blocco DINAMICO del
 * prompt, mai nel primo messaggio di sistema, che deve restare identico byte
 * per byte (regola 2). Il formato — due frasi, parlate — viene dalle regole
 * cached e non si ripete qui.
 *
 *  - nomina ciò che ha sentito: nome (se l'ha detto: regola 7, mai inventare)
 *    e un dettaglio preciso con le sue parole;
 *  - al massimo UNA domanda, su quel dettaglio;
 *  - nessuna promessa: il «giorno dopo cita» è probabile, non garantito.
 */
export const FIRST_EXCHANGE_RULE =
  "È la prima volta che parli con questa persona. Rispondile nominando quello che ti ha detto: " +
  "il suo nome, se te l'ha detto (se no, non inventarlo), e un dettaglio preciso con le sue parole. " +
  "Fai al massimo una domanda, su quel dettaglio e non su altro. " +
  "Non promettere di ricordare né di riparlarne: non sai se succederà.";

/**
 * Il primo scambio: questa creatura non ha MAI avuto un messaggio, in nessun
 * canale e di nessuna età. Non basta lo storico dei turni (12 ore): una
 * creatura riaperta dopo due giorni non è al primo incontro.
 */
export async function isFirstExchange(db: DbClient, gosinoId: string): Promise<boolean> {
  const [spoken] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.gosinoId, gosinoId))
    .limit(1);
  return spoken === undefined;
}

export class FirstMeeting {
  public constructor(private readonly db: DbClient) {}

  /**
   * La frase da dire, se è il primo incontro di questa creatura, e solo a chi
   * arriva primo. `undefined` in ogni altro caso: già salutato, già con una
   * storia, o una creatura che non esiste.
   */
  public async greeting(gosinoId: string): Promise<string | undefined> {
    return this.db.transaction(async (tx) => {
      // dieci connessioni insieme si mettono in fila qui: una sola vedrà «non
      // ancora» e scriverà il marcatore, le altre lo troveranno scritto
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${FIRST_MEETING_EVENT}:${gosinoId}`}))`,
      );

      const [creature] = await tx
        .select({ name: gosini.name })
        .from(gosini)
        .where(eq(gosini.id, gosinoId));
      if (creature === undefined) return undefined;

      const [met] = await tx
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.gosinoId, gosinoId), eq(events.type, FIRST_MEETING_EVENT)))
        .limit(1);
      if (met !== undefined) return undefined;

      const [spoken] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.gosinoId, gosinoId))
        .limit(1);
      if (spoken !== undefined) return undefined;

      await tx.insert(events).values({
        gosinoId,
        source: "system",
        type: FIRST_MEETING_EVENT,
        payload: {},
      });
      return firstMeetingLine(creature.name);
    });
  }
}
