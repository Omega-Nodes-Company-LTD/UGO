import { gosini, households, traitSets, type DbClient } from "@ugo/db";
import { generateDataKey, wrapDataKey } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { ARCHETYPES, characterFrom } from "./council/character.js";
import { drawLifeJitter } from "./lifeDice.js";
import { issueToken } from "./tenantAuth.js";

/**
 * Far nascere una casa (ADR-019 §162).
 *
 * Tutti i pezzi esistevano già — `generateDataKey`, `wrapDataKey`, `issueToken`,
 * `characterFrom` — e mancava solo l'orchestrazione, che è il motivo per cui il
 * vicinato è rimasto a lungo una cosa che lo schema sapeva fare e il sistema no.
 *
 * Cinque atti in **una transazione**, perché una casa a metà è peggio di nessuna
 * casa: una `households` senza DEK non può cifrare niente, un esemplare senza
 * genoma è un default silenzioso, e un proprietario senza token non entra in
 * casa propria. Se salta un pezzo non deve restarne nessuno.
 *
 * Il token si stampa **una volta sola** e non si può ristampare: in database
 * c'è solo lo SHA-256 (ADR-019 §92). Chi lo perde ne fa emettere un altro, che
 * è la proprietà che si vuole — un segreto recuperabile non è un segreto.
 */

export interface NewHouseholdInput {
  /** maneggevole e stabile: finisce negli URL, nei log e nel pannello */
  slug: string;
  name: string;
  /** il fuso della casa: due famiglie sognano alle 02:30 **loro** */
  timezone?: string;
  locale?: string;
  /** ADR-061: casa (PET, ricordi) o azienda (reception, clienti). Default casa */
  kind?: "home" | "business";
  /** come si chiamerà il primo gosino. Una casa senza creatura è un database */
  gosinoName?: string;
  /**
   * Il suo carattere di partenza. Un nome sconosciuto non è un errore: vale
   * come «nessun archetipo», cioè un UGO senza spigoli — rifiutare la nascita
   * di una casa per un refuso in un campo facoltativo sarebbe sproporzionato.
   */
  archetype?: string;
  /**
   * ADR-081 — le due autorizzazioni, e si danno **qui**, cioè sulla riga di
   * comando di chi possiede l'installazione. Non dal pannello: chi può coniare
   * capostipiti e chi può allevare è una decisione dell'allevamento, non una
   * casella che una casa può spuntarsi da sé.
   */
  foundry?: boolean;
  breeder?: boolean;
}

export interface NewHousehold {
  householdId: string;
  gosinoId: string;
  slug: string;
  persona: string;
  /** in chiaro, e per l'unica volta in cui esisterà in chiaro */
  ownerToken: string;
  tokenId: string;
}

export class HouseholdSlugTakenError extends Error {
  public constructor(slug: string) {
    super(`la casa "${slug}" esiste già`);
    this.name = "HouseholdSlugTakenError";
  }
}

export async function createHousehold(
  db: DbClient,
  masterKey: Buffer,
  input: NewHouseholdInput,
): Promise<NewHousehold> {
  const slug = input.slug.trim().toLowerCase();
  if (slug === "") throw new Error("lo slug non può essere vuoto");

  const [taken] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.slug, slug))
    .limit(1);
  if (taken !== undefined) throw new HouseholdSlugTakenError(slug);

  const character = characterFrom(
    input.archetype === undefined ? {} : (ARCHETYPES[input.archetype] ?? {}),
  );

  return db.transaction(async (tx) => {
    const [house] = await tx
      .insert(households)
      .values({
        slug,
        name: input.name.trim(),
        // la DEK nasce qui e non la vede nessuno: quello che si salva è la sua
        // versione avvolta con la KEK di processo (ADR-017)
        wrappedDataKey: wrapDataKey(generateDataKey(), masterKey),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.locale !== undefined && { locale: input.locale }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.foundry === true && { isFoundry: true }),
        ...(input.breeder === true && { canBreed: true }),
      })
      .returning({ id: households.id });
    if (house === undefined) throw new Error("la casa non è stata creata");

    const [born] = await tx
      .insert(gosini)
      .values({
        householdId: house.id,
        name: input.gosinoName ?? "ugo",
        // ADR-077: anche il primo di una casa nuova nasce mortale. `mortal_from`
        // nullo resta soltanto per chi c'era prima dell'arco — una porta di
        // nascita che non lo scriva è una porta sull'immortalità
        mortalFrom: new Date(),
        lifeJitterDays: drawLifeJitter(),
        /**
         * ADR-081: il primo di una casa è **coniato**, quindi capostipite —
         * e i capostipiti non si vendono. Resta qui, per ora, perché una
         * famiglia che ricevesse una casa vuota non avrebbe oggi nessun modo
         * di riempirla: la cessione di un nato è il passo successivo, e
         * finché non c'è, togliere questa riga vorrebbe dire consegnare case
         * senza nessuno dentro.
         */
        origin: "capostipite",
      })
      .returning({ id: gosini.id });
    if (born === undefined) throw new Error("l'esemplare non è stato creato");

    // versione 1 del genoma, immutabile da qui: un cambio è una versione nuova.
    // Stessa forma della nascita di un gosino in `routes/gosini.ts`, di
    // proposito: due strade per nascere che scrivono righe diverse sono il
    // difetto che il gruppo 5 è andato a togliere altrove.
    await tx.insert(traitSets).values({
      householdId: house.id,
      gosinoId: born.id,
      version: 1,
      traits: character.traits,
      mutationNote:
        input.archetype === undefined ? "casa nuova" : `casa nuova, archetipo: ${input.archetype}`,
    });

    const issued = await issueToken(tx as unknown as DbClient, {
      householdId: house.id,
      role: "owner",
      label: `proprietario di ${slug}`,
    });

    return {
      householdId: house.id,
      gosinoId: born.id,
      slug,
      persona: character.persona,
      ownerToken: issued.token,
      tokenId: issued.id,
    };
  });
}
