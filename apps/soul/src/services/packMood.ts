import { gosini, psycheSnapshots, type DbClient } from "@ugo/db";
import { and, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import { PSYCHE_VARIABLES } from "@ugo/psyche";

/**
 * L'umore del branco nel tempo (ADR-087).
 *
 * La psiche c'è da PROGETTO §5.3 e si vedeva in due posti: **adesso** (le sei
 * barre) e **le ultime 48 ore** di un esemplare. Mancava la domanda che una
 * casa con più creature si fa per prima — *chi sta bene e chi no, e da
 * quanto* — e mancava per una ragione che il pannello nascondeva: sulla
 * pagina di casa il grafico prendeva gli snapshot di **tutti** e ne faceva
 * **una riga sola**. Non era la storia di nessuno: era una linea che saltava
 * fra creature diverse, e sembrava un umore che oscilla.
 *
 * Qui le serie restano separate — una per creatura — e sono **medie
 * giornaliere**: due settimane di snapshot grezzi sono decine di migliaia di
 * punti che nessuno schermo disegna e nessun occhio legge. Il giorno è la
 * grana giusta per la domanda «da quanto è così».
 */

export interface PackDay {
  /** `YYYY-MM-DD` */
  day: string;
  /** la media di quel giorno, variabile per variabile */
  vars: Record<string, number>;
}

export interface PackSeries {
  id: string;
  name: string;
  days: PackDay[];
}

/** Il massimo che si può chiedere: oltre, la media giornaliera mente da sola. */
export const MAX_DAYS = 180;
export const DEFAULT_DAYS = 14;

export class PackMood {
  public constructor(private readonly db: DbClient) {}

  public async series(accountId: string, days = DEFAULT_DAYS): Promise<PackSeries[]> {
    const window = Math.min(Math.max(1, Math.trunc(days)), MAX_DAYS);
    const from = new Date(Date.now() - window * 86_400_000);

    /**
     * Le medie si fanno **in Postgres**, non qui: portarsi in memoria ogni
     * snapshot di due settimane per dividerli in JavaScript vorrebbe dire
     * spostare decine di migliaia di righe per ottenerne quattordici.
     */
    /**
     * Una colonna per variabile invece di un `jsonb_build_object`: quello
     * costringeva Postgres a indovinare il tipo dei nomi passati come
     * parametri, e non indovinava — la query moriva intera. Sei medie
     * dichiarate sono anche più leggibili di un oggetto costruito a mano.
     */
    const day = sql<string>`to_char(${psycheSnapshots.ts}, 'YYYY-MM-DD')`;
    const columns: Record<string, SQL<number>> = {};
    for (const name of PSYCHE_VARIABLES) {
      columns[name] = sql<number>`avg((${psycheSnapshots.vars} ->> ${name})::float)`.mapWith(
        Number,
      );
    }

    const rows = await this.db
      .select({ id: gosini.id, who: gosini.name, day, ...columns })
      .from(psycheSnapshots)
      .innerJoin(gosini, eq(gosini.id, psycheSnapshots.gosinoId))
      .where(
        and(
          eq(gosini.accountId, accountId),
          // chi se n'è andato non ha un umore: ha una biografia (ADR-075)
          isNull(gosini.retiredAt),
          gte(psycheSnapshots.ts, from),
        ),
      )
      .groupBy(gosini.id, gosini.name, day)
      .orderBy(gosini.name, day);

    const byCreature = new Map<string, PackSeries>();
    for (const row of rows) {
      const found = byCreature.get(row.id) ?? { id: row.id, name: row.who, days: [] };
      const vars: Record<string, number> = {};
      for (const name of PSYCHE_VARIABLES) {
        const value = (row as unknown as Record<string, unknown>)[name];
        if (typeof value === "number" && Number.isFinite(value)) {
          // tre decimali: la psiche è 0..1, e il quarto decimale di una media
          // giornaliera è rumore che finge di essere una misura
          vars[name] = Math.round(value * 1000) / 1000;
        }
      }
      found.days.push({ day: row.day, vars });
      byCreature.set(row.id, found);
    }
    return [...byCreature.values()];
  }
}
