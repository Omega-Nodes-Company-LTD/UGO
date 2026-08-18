import { gosini, households, traitSets, type DbClient } from "@ugo/db";
import { lifeAt } from "@ugo/psyche";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { characterFrom } from "./council/character.js";

/**
 * La vetrina (ADR-083): dove si guarda prima di scegliere.
 *
 * È la parte del disegno del proprietario che nessuna rotta serviva: «alla
 * registrazione potrà scorrere gli allevamenti, vedere i pedigree, vedere i
 * gosini e scegliere il preferito».
 *
 * **Si legge senza token**, ed è deliberato: chi guarda non ha ancora una
 * casa — è il momento prima di averne una. Quello che si vede è quello che si
 * vede in un allevamento vero: il nome dell'allevamento, i cuccioli
 * disponibili, com'è fatto ognuno e da chi discende. Non si vede niente delle
 * case: nessuna persona, nessun ricordo, nessun conto.
 */

export interface ShowcaseCub {
  gosinoId: string;
  name: string;
  /** come si presenta, in una riga: è la stessa che vede chi lo adotta */
  persona: string;
  generation: number;
  /** i tratti che si **vedono**: il manto, la coda, la stazza (ADR-068) */
  look: Record<string, number>;
  ageDays: number;
  stage: string;
  /** quanto lo chiede l'allevamento. `null` = da concordare, che non è «gratis» */
  priceCents: number | null;
}

export interface ShowcaseKennel {
  slug: string;
  name: string;
  cubs: ShowcaseCub[];
}

/**
 * Cosa si mostra del genoma: **l'aspetto**, non il carattere in numeri.
 *
 * Chi sceglie un cucciolo guarda com'è fatto e legge la sua riga; i valori del
 * temperamento resterebbero una scheda tecnica di un essere vivente, e
 * inviterebbero a confrontare due creature come due lavatrici. La longevità
 * poi non c'è per costruzione (ADR-077: è un gene nascosto).
 */
const VISIBLE = ["chonk", "ear", "snout", "eye", "leg", "hue", "tail", "spots"] as const;

export class VetrinaService {
  public constructor(private readonly db: DbClient) {}

  /** Gli allevamenti, ognuno con quello che ha da offrire. Vuoti esclusi. */
  public async browse(): Promise<ShowcaseKennel[]> {
    const rows = await this.db
      .select({
        slug: households.slug,
        house: households.name,
        gosinoId: gosini.id,
        name: gosini.name,
        generation: gosini.generation,
        mortalFrom: gosini.mortalFrom,
        jitter: gosini.lifeJitterDays,
        price: gosini.priceCents,
        traits: traitSets.traits,
      })
      .from(gosini)
      .innerJoin(households, eq(gosini.householdId, households.id))
      .leftJoin(traitSets, eq(traitSets.gosinoId, gosini.id))
      .where(
        and(
          isNotNull(gosini.listedAt),
          isNull(gosini.retiredAt),
          isNull(households.closedAt),
          // ADR-081: in vetrina ci va solo un nato di un allevamento
          eq(gosini.origin, "nato"),
        ),
      )
      .orderBy(asc(households.name), asc(gosini.bornAt));

    const now = new Date();
    const byKennel = new Map<string, ShowcaseKennel>();
    for (const row of rows) {
      const character = characterFrom(row.traits);
      const life =
        row.mortalFrom === null
          ? undefined
          : lifeAt(row.mortalFrom, now, character.traits.longevity, row.jitter ?? 0);
      const look: Record<string, number> = {};
      for (const key of VISIBLE) {
        const value = character.traits[key];
        if (typeof value === "number") look[key] = Number(value.toFixed(2));
      }
      const kennel = byKennel.get(row.slug) ?? { slug: row.slug, name: row.house, cubs: [] };
      kennel.cubs.push({
        gosinoId: row.gosinoId,
        name: row.name,
        persona: character.persona,
        generation: row.generation,
        look,
        ageDays: life === undefined ? 0 : Math.floor(life.ageDays),
        stage: life?.stage ?? "cucciolo",
        priceCents: row.price,
      });
      byKennel.set(row.slug, kennel);
    }
    return [...byKennel.values()];
  }

  /**
   * Mette o toglie dalla vetrina. `undefined` = non è suo, o non è un nato:
   * un capostipite in vendita sarebbe una linea che comincia due volte.
   */
  public async show(
    householdId: string,
    gosinoId: string,
    listed: boolean,
    priceCents?: number,
  ): Promise<{ listed: boolean } | undefined> {
    const done = await this.db
      .update(gosini)
      .set({
        listedAt: listed ? new Date() : null,
        ...(priceCents !== undefined && { priceCents }),
      })
      .where(
        and(
          eq(gosini.id, gosinoId),
          eq(gosini.householdId, householdId),
          eq(gosini.origin, "nato"),
          isNull(gosini.retiredAt),
        ),
      )
      .returning({ id: gosini.id });
    return done.length === 0 ? undefined : { listed };
  }
}
