import {
  beings,
  gosini,
  memories,
  memoryBeings,
  traitSets,
  type DbClient,
} from "@ugo/db";
import { decryptText, encryptText, generateDataKey } from "@ugo/shared";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import { drawLifeJitter } from "./lifeDice.js";
import { buildRedactor } from "./privacy/redaction.js";

/**
 * La dote (ADR-074): il sapere che viaggia con la creatura.
 *
 * Non è un export — un export lo prende chi ha già diritto a quei dati, una
 * dote la riceve **qualcun altro**. Per questo la curatela avviene PRIMA che
 * i dati escano: la tua biografia puoi donarla, quella degli altri no.
 *
 * Messaggi e trascrizioni non hanno una modalità per viaggiare: non è una
 * spunta che manca, è che sono la vita di chi c'era, non il sapere della
 * creatura.
 */

/** Cosa può stare in una dote. `episode`/`preference` solo se richiesti. */
const KNOWLEDGE_KINDS = ["fact", "insight"] as const;
const STORY_KINDS = ["episode", "preference"] as const;
type TravellingKind = (typeof KNOWLEDGE_KINDS | typeof STORY_KINDS)[number];

export interface DowryOptions {
  /** i racconti viaggiano solo se chiesti esplicitamente */
  includeStories?: boolean;
  /** chi dona: i ricordi che riguardano SOLO lui possono viaggiare */
  giverBeingId?: string;
}

export interface DowryPreview {
  gosinoName: string;
  knowledge: number;
  stories: number;
  /** quanti ricordi restano a casa perché nominano qualcun altro */
  withheldForOthers: number;
  /** classi che non viaggiano mai, contate per onestà */
  neverTravels: { messages: string; transcripts: string; bonds: string };
}

/**
 * Una dote è **input esterno**: arriva da un'altra casa, magari da un'altra
 * persona. Zod a ogni confine (CLAUDE.md): tipizzarla come fidata perché
 * l'abbiamo scritta noi sarebbe la stessa fiducia che il pedigree esiste per
 * non concedere.
 */
export const dowryContentSchema = z.object({
  version: z.literal(1),
  gosinoName: z.string().min(1).max(60),
  genome: z.record(z.string(), z.unknown()).default({}),
  memories: z
    .array(
      z.object({
        kind: z.enum(["fact", "preference", "episode", "insight"]),
        text: z.string().min(1).max(4000),
        importance: z.number().min(0).max(1).default(0.5),
      }),
    )
    .max(5000),
  note: z.string().max(200).default(""),
});

export type DowryContent = z.infer<typeof dowryContentSchema>;

export class DowryService {
  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
  ) {}

  /**
   * I ricordi che possono viaggiare: del tipo giusto, e **non collegati a un
   * essere che non sia chi dona** (ADR-024: il collegamento lo scrive il
   * sogno, non un'euristica sul testo).
   *
   * Pubblica perché è la stessa curatela che costruisce il **lascito** alla
   * morte (ADR-075): ciò che può essere donato da vivi è ciò che può
   * sopravvivere alla creatura. Duplicarla vorrebbe dire due regole di
   * privacy che possono divergere.
   */
  public async legacyOf(
    gosinoId: string,
    householdId: string,
    options: DowryOptions,
  ): Promise<{ rows: { kind: TravellingKind; text: string; importance: number }[]; withheld: number }> {
    const kinds: TravellingKind[] = [
      ...KNOWLEDGE_KINDS,
      ...(options.includeStories === true ? STORY_KINDS : []),
    ];

    const mine = await this.db
      .select({
        id: memories.id,
        kind: memories.kind,
        text: memories.text,
        importance: memories.importance,
      })
      .from(memories)
      .where(
        and(
          eq(memories.gosinoId, gosinoId),
          inArray(memories.kind, kinds),
          isNull(memories.invalidatedAt),
        ),
      );
    if (mine.length === 0) return { rows: [], withheld: 0 };

    // chi compare in ognuno: un solo essere che non è il donatore basta a
    // tenere il ricordo a casa
    const links = await this.db
      .select({ memoryId: memoryBeings.memoryId, beingId: memoryBeings.beingId })
      .from(memoryBeings)
      .where(
        and(
          eq(memoryBeings.householdId, householdId),
          inArray(
            memoryBeings.memoryId,
            mine.map((row) => row.id),
          ),
        ),
      );
    const others = new Set(
      links
        .filter((link) => link.beingId !== options.giverBeingId)
        .map((link) => link.memoryId),
    );

    /**
     * La seconda guardia. Non redige: **trattiene**.
     *
     * Un ricordo che ha avuto bisogno della redazione è un ricordo su
     * qualcun altro, e anonimizzarlo non lo rende tuo. C'è anche un argomento
     * pratico: la redazione conosce solo i nomi del branco — se ha reagito,
     * quel ricordo parla di persone, e allora può contenerne anche una che
     * non abbiamo mai registrato, sulla quale non reagirebbe.
     */
    const names = await this.db
      .select({ displayName: beings.displayName, aliases: beings.aliases })
      .from(beings)
      .where(
        options.giverBeingId === undefined
          ? eq(beings.householdId, householdId)
          : and(
              eq(beings.householdId, householdId),
              notInArray(beings.id, [options.giverBeingId]),
            ),
      );
    const redact = buildRedactor(
      names.flatMap((row) => [row.displayName, ...row.aliases]).filter(Boolean),
    );

    const rows: { kind: TravellingKind; text: string; importance: number }[] = [];
    let withheld = 0;
    for (const row of mine) {
      if (others.has(row.id)) {
        withheld += 1;
        continue;
      }
      const text = this.readable(row.text);
      if (text.trim() === "") continue;
      if (redact(text) !== text) {
        withheld += 1;
        continue;
      }
      rows.push({ kind: row.kind, text, importance: row.importance });
    }
    return { rows, withheld };
  }

  /**
   * Il testo com'è leggibile (ADR-091).
   *
   * Prima provava a decifrare **sempre** e tornava stringa vuota se non ci
   * riusciva — e il ciclo qui sopra salta le stringhe vuote. Siccome i
   * ricordi sono in chiaro (ADR-022: il sogno li scrive così), la decifratura
   * falliva su quasi tutti e **il lascito di una creatura normale usciva
   * vuoto**: «il lascito resta» era falso nel modo più letterale che ci sia.
   *
   * Non l'ha visto nessun test perché le fixture seminavano ricordi cifrati,
   * cioè ripetevano l'assunzione sbagliata invece di metterla alla prova.
   *
   * Adesso: in chiaro passa, cifrato si apre, illeggibile resta vuoto — e
   * quello sì che si salta, perché è l'unico caso in cui davvero non c'è
   * niente da tramandare.
   */
  private readable(value: string): string {
    if (!value.startsWith("v1:")) return value;
    try {
      return decryptText(value, this.dataKey);
    } catch {
      return "";
    }
  }

  public async preview(
    householdId: string,
    gosinoId: string,
    options: DowryOptions = {},
  ): Promise<DowryPreview | undefined> {
    const [creature] = await this.db
      .select({ name: gosini.name })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.householdId, householdId)));
    if (creature === undefined) return undefined;

    const knowledge = await this.legacyOf(gosinoId, householdId, {
      ...options,
      includeStories: false,
    });
    const withStories = await this.legacyOf(gosinoId, householdId, {
      ...options,
      includeStories: true,
    });

    return {
      gosinoName: creature.name,
      knowledge: knowledge.rows.length,
      stories: withStories.rows.length - knowledge.rows.length,
      withheldForOthers: withStories.withheld,
      neverTravels: {
        messages: "mai: sono la vita di chi c'era",
        transcripts: "mai: sono voci di persone",
        bonds: "mai: i legami sono di chi li ha vissuti",
      },
    };
  }

  /**
   * Crea la dote. La chiave è **nuova e mostrata una volta sola**: una dote
   * che si aprisse con la chiave di casa porterebbe con sé la possibilità di
   * leggere tutto il resto.
   */
  public async create(
    householdId: string,
    gosinoId: string,
    options: DowryOptions = {},
  ): Promise<{ key: string; sealed: string; content: DowryPreview } | undefined> {
    const preview = await this.preview(householdId, gosinoId, options);
    if (preview === undefined) return undefined;

    const [genome] = await this.db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, gosinoId))
      .orderBy(traitSets.version)
      .limit(1);
    const { rows } = await this.legacyOf(gosinoId, householdId, options);

    const content: DowryContent = {
      version: 1,
      gosinoName: preview.gosinoName,
      genome: (genome?.traits ?? {}) as Record<string, unknown>,
      memories: rows,
      note: `dote di ${preview.gosinoName}`,
    };
    const dowryKey = generateDataKey();
    return {
      key: dowryKey.toString("base64"),
      sealed: encryptText(JSON.stringify(content), dowryKey),
      content: preview,
    };
  }

  /**
   * Adottare una dote: **fa nascere** un esemplare che sa quelle cose, non
   * «ripristina» il gosino di qualcun altro. Nella casa che riceve è un
   * capostipite, e la provenienza resta scritta.
   */
  public async adopt(
    householdId: string,
    sealed: string,
    key: string,
    name: string,
    /**
     * Senza embedder il sapere adottato entra comunque, ma è ripescabile solo
     * dal braccio **lessicale** della ricerca ibrida (ADR-022) — non è una
     * dote muta, è una dote che si trova per parole invece che per senso.
     * Con l'embedder è ripescabile come tutto il resto.
     */
    embedder?: { embed: (texts: string[]) => Promise<number[][]> },
  ): Promise<{ gosinoId: string; learned: number; embedded: boolean } | undefined> {
    let content: DowryContent;
    try {
      const opened: unknown = JSON.parse(decryptText(sealed, Buffer.from(key, "base64")));
      const parsed = dowryContentSchema.safeParse(opened);
      if (!parsed.success) return undefined;
      content = parsed.data;
    } catch {
      // chiave sbagliata, archivio rotto, o qualcosa che non è una dote
      return undefined;
    }

    const [born] = await this.db
      .insert(gosini)
      // ADR-077: chi nasce da una dote nasce adesso, quindi nasce mortale —
      // la dote porta il sapere, non l'esenzione dall'arco
      .values({
        householdId,
        name,
        mortalFrom: new Date(),
        lifeJitterDays: drawLifeJitter(),
        // ADR-081: chi nasce da una dote è capostipite in casa sua — porta un
        // sapere, non una discendenza — e quindi non è cedibile come un nato
        origin: "dote",
      })
      .returning({ id: gosini.id });
    if (born === undefined) return undefined;

    await this.db.insert(traitSets).values({
      householdId,
      gosinoId: born.id,
      version: 1,
      traits: content.genome,
      mutationNote: `dote adottata (da ${content.gosinoName})`,
    });

    const usable = content.memories.filter((memory) => memory.text.trim() !== "");
    let vectors: number[][] | undefined;
    if (embedder !== undefined && usable.length > 0) {
      try {
        vectors = await embedder.embed(usable.map((memory) => memory.text));
      } catch {
        // embedder giù: il sapere entra lo stesso, e lo dice il risultato
        vectors = undefined;
      }
    }

    let learned = 0;
    for (const [index, memory] of usable.entries()) {
      const vector = vectors?.[index];
      // `memories` è scopata per esemplare, non per casa (ADR-019: i ricordi
      // sono della creatura) — il confine passa da `gosino_id`
      await this.db.insert(memories).values({
        gosinoId: born.id,
        kind: memory.kind,
        /**
         * In CHIARO, come ogni altro ricordo (ADR-022, riaperto e confermato
         * da ADR-091).
         *
         * Cifrarlo qui sembrava prudenza e faceva quattro danni: la riga non
         * si ripescava più (il braccio lessicale gira sul ciphertext), **la
         * redazione dell'oblio non la toccava** — il nome di una persona
         * cancellata ci restava dentro, riapribile con la chiave di casa —
         * e, se quella riga finiva a sua volta in un lascito, veniva cifrata
         * una seconda volta e diventava illeggibile per sempre.
         */
        text: memory.text,
        importance: memory.importance,
        ...(vector !== undefined && { embedding: vector }),
      });
      learned += 1;
    }
    return { gosinoId: born.id, learned, embedded: vectors !== undefined };
  }
}
