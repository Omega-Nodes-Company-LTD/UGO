import { gosini, accounts, places, traitSets, type DbClient } from "@ugo/db";
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
 * casa: una `accounts` senza DEK non può cifrare niente, un esemplare senza
 * genoma è un default silenzioso, e un proprietario senza token non entra in
 * casa propria. Se salta un pezzo non deve restarne nessuno.
 *
 * Il token si stampa **una volta sola** e non si può ristampare: in database
 * c'è solo lo SHA-256 (ADR-019 §92). Chi lo perde ne fa emettere un altro, che
 * è la proprietà che si vuole — un segreto recuperabile non è un segreto.
 */

export interface NewAccountInput {
  /** maneggevole e stabile: finisce negli URL, nei log e nel pannello */
  slug: string;
  name: string;
  /** il fuso della casa: due famiglie sognano alle 02:30 **loro** */
  timezone?: string;
  locale?: string;
  /** ADR-061: casa (PET, ricordi) o azienda (reception, clienti). Default casa */
  kind?: "home" | "business";
  /**
   * ADR-082: come si chiamerà il **capostipite coniato insieme alla casa** —
   * e coniare è un atto d'allevamento, non l'arredamento di una casa nuova.
   *
   * Assente, **la casa nasce vuota**: è ciò che deve succedere a una famiglia,
   * che il suo gosino lo riceve scegliendolo fra i nati (ADR-081). Prima
   * questa riga valeva `"ugo"` per default, e quindi ogni casa del mondo
   * nasceva con una creatura creata dal nulla.
   */
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

export interface NewAccount {
  accountId: string;
  /** presente solo se è stato coniato un capostipite (v. `gosinoName`) */
  gosinoId?: string;
  slug: string;
  persona: string;
  /** in chiaro, e per l'unica volta in cui esisterà in chiaro */
  ownerToken: string;
  tokenId: string;
}

export class AccountSlugTakenError extends Error {
  public constructor(slug: string) {
    super(`la casa "${slug}" esiste già`);
    this.name = "AccountSlugTakenError";
  }
}

export async function createAccount(
  db: DbClient,
  masterKey: Buffer,
  input: NewAccountInput,
): Promise<NewAccount> {
  const slug = input.slug.trim().toLowerCase();
  if (slug === "") throw new Error("lo slug non può essere vuoto");

  const [taken] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.slug, slug))
    .limit(1);
  if (taken !== undefined) throw new AccountSlugTakenError(slug);

  const character = characterFrom(
    input.archetype === undefined ? {} : (ARCHETYPES[input.archetype] ?? {}),
  );

  const founderName = input.gosinoName?.trim();

  return db.transaction(async (tx) => {
    const [house] = await tx
      .insert(accounts)
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
      .returning({ id: accounts.id });
    if (house === undefined) throw new Error("la casa non è stata creata");

    // ADR-082: la casa nasce vuota se nessuno ha chiesto un capostipite
    if (founderName === undefined || founderName === "") {
      const issuedAlone = await issueToken(tx as unknown as DbClient, {
        accountId: house.id,
        role: "owner",
        label: `proprietario di ${slug}`,
      });
      return {
        accountId: house.id,
        slug,
        persona: character.persona,
        ownerToken: issuedAlone.token,
        tokenId: issuedAlone.id,
      };
    }

    const [born] = await tx
      .insert(gosini)
      .values({
        accountId: house.id,
        name: founderName,
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
      accountId: house.id,
      gosinoId: born.id,
      version: 1,
      traits: character.traits,
      mutationNote:
        input.archetype === undefined
          ? "capostipite coniato con la casa"
          : `capostipite coniato con la casa, archetipo: ${input.archetype}`,
    });

    /**
     * ADR-113: un account nasce con **un luogo**.
     *
     * La migrazione aveva traghettato le case esistenti e nessuno aveva pensato
     * a quelle nuove: nascevano senza luoghi, quindi senza cielo, e le stanze
     * che ci si creavano dentro non stavano in nessun posto. L'hanno trovato i
     * test d'integrazione, e la lezione è la stessa di sempre — un traghetto
     * che riguarda solo il passato lascia scoperto il futuro.
     *
     * Si chiama «Casa» perché è come lo chiamerebbe chi ci vive, e il nome si
     * cambia dal pannello: nascere senza nome sarebbe una riga che nessuno
     * riconosce.
     */
    await tx.insert(places).values({ accountId: house.id, name: "Casa", slug: "casa" });

    const issued = await issueToken(tx as unknown as DbClient, {
      accountId: house.id,
      role: "owner",
      label: `proprietario di ${slug}`,
    });

    return {
      accountId: house.id,
      gosinoId: born.id,
      slug,
      persona: character.persona,
      ownerToken: issued.token,
      tokenId: issued.id,
    };
  });
}

/**
 * La stessa cosa, ma con la certezza del capostipite: per chi non può
 * proseguire senza (la riga di comando dell'allevatore, e i test che
 * misurano una creatura). Esiste per non spargere controlli su un
 * `gosinoId` che il chiamante ha appena chiesto esplicitamente.
 */
export async function createAccountWithFounder(
  db: DbClient,
  masterKey: Buffer,
  input: NewAccountInput & { gosinoName: string },
): Promise<NewAccount & { gosinoId: string }> {
  const born = await createAccount(db, masterKey, input);
  if (born.gosinoId === undefined) throw new Error("il capostipite non è stato coniato");
  return { ...born, gosinoId: born.gosinoId };
}
