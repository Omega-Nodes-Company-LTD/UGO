import { gosini, accounts, psycheBaselines, traitSets, type DbClient } from "@ugo/db";
import { DEFAULT_LOCALE } from "@ugo/prompts";
import { lifeAt } from "@ugo/psyche";
import type { SpeciesMap } from "@ugo/shared";
import type { ChatLlm, EmbeddingsClient, LocalTextClient } from "@ugo/memory";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AudioStorageConfig } from "../../routes/audio.js";
import { ChatService } from "../chatService.js";
import { characterFrom, type Character } from "../council/character.js";
import { ParcelService } from "../parcelService.js";
import { TieService } from "../tieService.js";
import { FaceGateway } from "../faceGateway.js";
import { PackService } from "../packService.js";
import { PsycheService } from "../psycheService.js";
import { SceneReader } from "../sceneReader.js";
import type { TurnLog } from "../diagnostics/turnLog.js";
import { storeVoiceSample } from "../voiceEnrolment.js";
import { Curiosity } from "../volition/curiosity.js";
import { EfficacyService } from "../volition/efficacy.js";
import { RewardService } from "../volition/reward.js";
import { VolitionService } from "../volition/volitionService.js";

/**
 * One runtime per exemplar (ADR-032).
 *
 * Everything that makes an exemplar himself — mood, memories, thread, diary,
 * initiative, the body he speaks through — used to be a single instance built
 * once at boot. Two gosini in one house were therefore one creature with two
 * names: the same psyche answering from two rooms.
 *
 * Now each one gets his own, and the registry is what a socket asks when it
 * says which of them it wants to be.
 *
 * What is deliberately NOT per exemplar: the account. The pack, the data
 * key, the budget and the clock belong to the house (ADR-019), and two
 * creatures under one roof must agree about who lives there.
 *
 * ADR-019 phase 2 adds the other half: the registry used to load *every*
 * exemplar in the database, so with two families each house's panel and each
 * house's dock would have found the neighbours' creatures in it. Each runtime
 * now carries the house it belongs to, and every question is asked of one
 * house. The single exception is named `everywhere()`, and it is the
 * server-wide initiative loop, which legitimately walks all of them.
 */

export interface GosinoRuntime {
  readonly id: string;
  /** the house this creature lives in (ADR-019): never crossed, only filtered */
  readonly accountId: string;
  /** mutable: a rename or a move must not cost him his living psyche (ADR-036) */
  name: string;
  /** "cucina", "studio" — the room whose device shows him (ADR-036) */
  where: string | undefined;
  character: Character;
  /**
   * Cosa serve al corpo per disegnare LUI (ADR-071): il genoma più ciò che
   * dipende dall'età — il grigio. Separato da `character.traits` apposta: un
   * gene si eredita, il grigio si vive, e confonderli vorrebbe dire che un
   * cucciolo può nascere già canuto.
   */
  bodyTraits: Record<string, number>;
  psyche: PsycheService;
  gateway: FaceGateway;
  volition: VolitionService;
  chat: ChatService;
  /**
   * Il fuso della casa (ADR-050), già risolto qui. Serve a chi lavora fuori
   * dalla chat e deve sapere che ore sono **in casa** — il check-in di
   * ADR-085, per cui «le nove di sera» sono le nove di chi vive lì e non del
   * processo che gira su un server in un altro continente.
   */
  readonly timezone: string;
}

/** Come questa casa scrive le date e quando finisce il suo giorno (ADR-050). */
export interface HouseClock {
  timezone: string;
  locale: string;
}

export interface RuntimeDeps {
  /**
   * ADR-098: la connessione DELLA CASA — `app.account_id` dichiarato alla
   * stretta di mano, ogni query del runtime già dentro il muro. `db` resta la
   * connessione di processo: serve solo a elencare le case (tabella
   * dichiarata leggibile, ADR-048 §7).
   */
  dbFor: (accountId: string) => DbClient;
  db: DbClient;
  embedder: EmbeddingsClient;
  /**
   * ADR-019 phase 2: a client per exemplar, because the ledger row says both
   * which house pays and which creature spent it. One client for the whole
   * process wrote every row against the seeded house — so a second family's
   * conversation drained the first one's day and its ceiling was never read.
   */
  llm: (accountId: string, gosinoId: string, clock: HouseClock) => ChatLlm;
  local: LocalTextClient;
  dataKey: Buffer;
  /** il cronometro dei turni, per la diagnostica. Assente = non si misura. */
  turnLog?: TurnLog;
  /**
   * Il fuso di ripiego, per la casa che non ne dichiara uno. ADR-050: quello
   * vero e' della casa e si legge insieme al resto — un fuso di processo per
   * tutte le famiglie era il modo in cui il salvadanaio si azzerava all'ora
   * del server invece che a mezzanotte loro.
   */
  timezone: string;
  /**
   * ADR-019 phase 2: a `PackService` belongs to one house *and* one exemplar,
   * so it is built here rather than injected once at boot. The map of species
   * is configuration and is shared.
   */
  speciesMap?: SpeciesMap;
  localModelUp: () => boolean;
  /**
   * ADR-104: **della casa**. Era `() => boolean` per tutto il processo, quindi
   * spegnere l'iniziativa da una casa la spegneva anche al vicino.
   */
  initiativeEnabled: (accountId: string) => boolean;
  /** ADR-107: se il giudice dell'astensione è acceso (`UGO_ABSTAIN`) */
  abstain?: boolean;
  hourOf: (at: Date) => number;
  /**
   * ADR-045: chi sta parlando. Assente = UGO risponde senza sapere chi hai
   * davanti. Una funzione della casa e non un'istanza sola (ADR-019 fase 2):
   * i profili biometrici sono per casa, e un riconoscitore costruito una volta
   * confronterebbe la voce di una famiglia coi centroidi di un'altra.
   */
  recognition?: (accountId: string) => {
    byVoice: (audioBase64: string) => Promise<{ beingId?: string | undefined } | undefined>;
    /** ADR-065: la lettura su gesto — tesseract sullo stesso servizio */
    ocr: (imageBase64: string) => Promise<string | undefined>;
  };
  /**
   * ADR-057, la seconda metà: il bucket dove finisce un campione di voce
   * arrivato dal chiosco. Assente = i frame `voice_sample` si ignorano.
   */
  audio?: AudioStorageConfig;
  /** ADR-063: la finestra sul mondo, condivisa — la query non porta la casa */
  web?: { ask: (query: string) => Promise<string | undefined> };
  /** ADR-064: le spinte («vai in…», «chiama…») — il servizio sa lui chi è chi */
  nudges?: { answer: (gosinoId: string, text: string, at: Date) => Promise<string | undefined> };
  /** gruppo 4 — input immagini: il vision locale, condiviso come `web` */
  vision?: { describe: (jpegBase64: string) => Promise<string | undefined> };
}

/**
 * Le baseline del genoma, scritte una volta sola.
 *
 * `on conflict do nothing` e' la riga che conta: da qui in avanti quelle
 * baseline sono **del sogno**, che le sposta di ±0.02 a notte (ADR-012). Un
 * upsert le riporterebbe al genoma a ogni riavvio, cioe' cancellerebbe ogni
 * settimana vissuta — che e' esattamente cio' che le baseline adattive sono
 * fatte per ricordare.
 */
async function seedBaselines(
  db: DbClient,
  gosinoId: string,
  baselines: Character["baselines"],
): Promise<void> {
  await db
    .insert(psycheBaselines)
    .values(
      Object.entries(baselines).map(([variable, baseline]) => ({ gosinoId, variable, baseline })),
    )
    .onConflictDoNothing();
}

/** Builds the whole apparatus for one exemplar. */
async function buildRuntime(
  deps: RuntimeDeps,
  row: {
    id: string;
    accountId: string;
    name: string;
    where: string | null;
    mortalFrom?: Date | null;
    jitter?: number | null;
  },
): Promise<GosinoRuntime> {
  const hdb = deps.dbFor(row.accountId);
  const [house] = await hdb
    .select({ timezone: accounts.timezone, locale: accounts.locale })
    .from(accounts)
    .where(eq(accounts.id, row.accountId));
  const timezone = house?.timezone ?? deps.timezone;
  const locale = house?.locale ?? DEFAULT_LOCALE;

  const traits = await hdb
    .select({ traits: traitSets.traits })
    .from(traitSets)
    .where(eq(traitSets.gosinoId, row.id))
    .orderBy(desc(traitSets.version))
    .limit(1);
  const character = characterFrom(traits[0]?.traits);
  /**
   * ADR-071: il muso non ha un orologio della vita, quindi il grigio glielo
   * calcola l'anima e glielo manda come un parametro di disegno qualunque.
   *
   * ADR-077: e lo conta da `mortal_from`, non dalla nascita — un capostipite
   * che non ha ancora accettato la mortalità non ingrigisce, perché non sta
   * ancora percorrendo nessun arco. Col dado dell'esemplare dentro, che è ciò
   * che rende il muso di due fratelli diverso lo stesso giorno.
   */
  const mortalFrom = row.mortalFrom ?? undefined;
  const greying =
    mortalFrom === undefined
      ? 0
      : lifeAt(mortalFrom, new Date(), character.traits.longevity, row.jitter ?? 0).greying;
  const bodyTraits: Record<string, number> = { ...character.traits, greying };

  // ADR-031, il pezzo che mancava: le baseline erano **calcolate e buttate**.
  // Un flemmatico ricavava uno stress di riposo basso e la psiche non lo
  // leggeva mai, perche' `psyche_baselines` per lui era vuota e `restore()`
  // ripiegava sui valori neutri del motore. Si seminano qui e non alla nascita
  // perche' cosi' vale anche per gli esemplari nati prima di questa riga; e
  // prima di `restore()`, o la prima vita partirebbe comunque neutra.
  await seedBaselines(hdb, row.id, character.baselines);
  const psyche = await PsycheService.restore(hdb, new Date(), row.id);
  const recognition = deps.recognition?.(row.accountId);
  const nudges = deps.nudges;
  // ADR-065: il lettore ha bisogno del gateway, che nasce DOPO la chat (il
  // gateway ha bisogno della chat). La scatola scioglie il cerchio: la chat
  // legge il corpo solo al momento del gesto, quando esiste da un pezzo.
  const body: { gateway?: FaceGateway } = {};
  const chat = new ChatService({
    db: hdb,
    embedder: deps.embedder,
    // il cronometro della diagnostica: **ogni** esemplare, non solo quello di
    // avvio — altrimenti la pagina misurerebbe una creatura sola e la casa
    // con due si diagnosticherebbe a metà
    ...(deps.turnLog !== undefined && { turnLog: deps.turnLog }),
    llm: deps.llm(row.accountId, row.id, { timezone, locale }),
    psyche,
    dataKey: deps.dataKey,
    timezone,
    locale,
    gosinoId: row.id,
    accountId: row.accountId,
    character,
    ...(deps.speciesMap !== undefined && {
      pack: new PackService(hdb, deps.speciesMap, row.id, row.accountId),
    }),
    ...(deps.web !== undefined && { web: deps.web }),
    // ADR-088: la storia della buonanotte la scrive il modello di casa, lo
    // stesso che l'iniziativa usa per le sue domande. Mai il provider.
    storyteller: deps.local,
    // ADR-107: lo stesso modello di casa fa anche il giudice dell'astensione.
    // Assente = spento: l'interruttore è la dipendenza che non arriva.
    ...(deps.abstain === true && { abstain: deps.local }),
    ...(recognition !== undefined && {
      reader: new SceneReader({
        gateway: () => body.gateway,
        ocr: (image) => recognition.ocr(image),
      }),
    }),
    ...(nudges !== undefined && {
      nudges: { answer: (text: string, at: Date) => nudges.answer(row.id, text, at) },
    }),
    ...(deps.vision !== undefined && { vision: deps.vision }),
    // ADR-099: la cartolina a voce — il gesto esiste per ogni esemplare,
    // perché la porta vera è il consenso della parentela, non il cablaggio
    postcards: {
      ties: new TieService(deps.db),
      parcels: new ParcelService(deps.db, deps.dataKey),
    },
  });
  // ADR-058: i pesi sono dell'esemplare, come i suoi ricordi e il suo umore.
  // Due gosini sotto lo stesso tetto imparano cose diverse, ed è il punto.
  const efficacy = new EfficacyService(hdb, row.id);
  const audio = deps.audio;
  const reward = new RewardService({
    db: hdb,
    gosinoId: row.id,
    accountId: row.accountId,
    efficacy,
  });
  const gateway = new FaceGateway({
    db: hdb,
    psyche,
    chat,
    gosinoId: row.id,
    reward: (input) => reward.give(input),
    ...(recognition !== undefined && { recognition }),
    // ADR-057: il deposito è lo stesso del pannello (`storeVoiceSample`), coi
    // controlli a monte dentro — minore e opt-out si rifiutano PRIMA del bucket
    ...(audio !== undefined && {
      voiceSample: (input: { beingId: string; audio: Buffer }) =>
        storeVoiceSample({ db: hdb, storage: audio }, { accountId: row.accountId, ...input }),
    }),
  });
  body.gateway = gateway;
  const volition = new VolitionService({
    db: hdb,
    gosinoId: row.id,
    psyche,
    gateway,
    curiosity: new Curiosity({
      db: hdb,
      local: deps.local,
      dataKey: deps.dataKey,
      name: row.name,
      gosinoId: row.id,
      persona: character.persona,
    }),
    efficacy,
    localModelUp: deps.localModelUp,
    enabled: () => deps.initiativeEnabled(row.accountId),
    hourOf: deps.hourOf,
  });

  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    where: row.where ?? undefined,
    character,
    bodyTraits,
    psyche,
    gateway,
    volition,
    chat,
    timezone,
  };
}

export class GosinoRegistry {
  private readonly byId = new Map<string, GosinoRuntime>();

  private constructor(private readonly deps: RuntimeDeps) {}

  public static async load(deps: RuntimeDeps): Promise<GosinoRegistry> {
    const registry = new GosinoRegistry(deps);
    await registry.reload();
    return registry;
  }

  /** Rebuilds from the database — called at boot and after a birth. */
  public async reload(): Promise<void> {
    /**
     * ADR-098: si iterano le CASE (tabella dichiarata leggibile, ADR-048 §7)
     * e il roster di ognuna si legge attraverso la SUA connessione. Leggere
     * `gosini` intero dalla connessione di processo, sotto `ugo_app`, avrebbe
     * risposto zero righe: processo in piedi e nessuna creatura, senza un
     * errore da nessuna parte.
     */
    const houses = await this.deps.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(isNull(accounts.closedAt));
    const rows: {
      id: string;
      accountId: string;
      name: string;
      where: string | null;
      mortalFrom: Date | null;
      jitter: number | null;
    }[] = [];
    for (const house of houses) {
      rows.push(
        ...(await this.deps
          .dbFor(house.id)
          .select({
            id: gosini.id,
            accountId: gosini.accountId,
            name: gosini.name,
            where: gosini.locationLabel,
            mortalFrom: gosini.mortalFrom,
            jitter: gosini.lifeJitterDays,
          })
          .from(gosini)
          .where(and(isNull(gosini.retiredAt), eq(gosini.accountId, house.id)))
          .orderBy(gosini.bornAt)),
      );
    }
    for (const row of rows) {
      const living = this.byId.get(row.id);
      if (living === undefined) {
        this.byId.set(row.id, await buildRuntime(this.deps, row));
        continue;
      }
      // ADR-036: he is already here, so his psyche, his thread and his pending
      // initiative stay exactly as they are — rebuilding would throw away a
      // living mind to change a label. Only what a move can change is copied
      // over; skipping the row entirely (as this used to) left `where` stale,
      // so a creature moved from the panel kept answering the old room's dock.
      living.name = row.name;
      living.where = row.where ?? undefined;
    }
  }

  /**
   * Every exemplar of every house. The name is deliberately awkward: there is
   * exactly one legitimate caller, the server-wide initiative loop, and any
   * other use is a house reading its neighbours.
   */
  public everywhere(): GosinoRuntime[] {
    return [...this.byId.values()];
  }

  /** The creatures of one house — what every route and every socket wants. */
  public all(accountId: string): GosinoRuntime[] {
    return this.everywhere().filter((runtime) => runtime.accountId === accountId);
  }

  /**
   * Everyone who lives in a room (ADR-036).
   *
   * The room is what a device shows, not the creature: a dock in the kitchen is
   * the kitchen's body, and whoever is in the kitchen appears on it. Matching is
   * case- and space-insensitive because the label is typed by a person twice —
   * once at the birth form and once in a URL — and "Studio" must find "studio".
   *
   * An unknown room gives back nobody rather than falling back to the eldest:
   * showing the wrong creature is worse than showing an empty room, which at
   * least tells the truth about what is there.
   */
  public inRoom(room: string, accountId: string): GosinoRuntime[] {
    const wanted = room.trim().toLowerCase();
    return this.all(accountId).filter(
      (runtime) => runtime.where?.trim().toLowerCase() === wanted,
    );
  }

  /** The rooms that have somebody in them, in the order they were settled. */
  public rooms(accountId: string): { room: string; gosini: GosinoRuntime[] }[] {
    const byRoom = new Map<string, GosinoRuntime[]>();
    for (const runtime of this.all(accountId)) {
      const room = runtime.where?.trim();
      if (room === undefined || room === "") continue;
      const key = room.toLowerCase();
      byRoom.set(key, [...(byRoom.get(key) ?? []), runtime]);
    }
    return [...byRoom.values()].map((gosini) => ({
      room: gosini[0]?.where?.trim() ?? "",
      gosini,
    }));
  }

  /**
   * Finds an exemplar by id, by name or by the room he lives in — the three
   * things a person would plausibly type into a URL. Unknown names fall back
   * to the default rather than refusing to show anything: a mistyped query
   * string must not leave a dock with a blank screen.
   */
  public resolve(query: string | undefined, accountId: string): GosinoRuntime | undefined {
    const here = this.all(accountId);
    if (query !== undefined && query !== "") {
      const wanted = query.trim().toLowerCase();
      const found = here.find(
        (runtime) =>
          runtime.id === query ||
          runtime.name.toLowerCase() === wanted ||
          runtime.where?.toLowerCase() === wanted,
      );
      if (found !== undefined) return found;
    }
    // the eldest of THIS house: falling back to the neighbours' eldest would be
    // the wrong creature answering, which is worse than a blank screen
    return here[0];
  }
}
