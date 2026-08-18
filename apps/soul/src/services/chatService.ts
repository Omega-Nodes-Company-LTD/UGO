import {
  beings,
  desires,
  diaryEntries,
  gosini,
  listItems,
  messages,
  type DbClient,
} from "@ugo/db";
import {
  searchMemories,
  searchTranscripts,
  type EmbeddingsClient,
  type LlmClient,
  type LlmHistoryTurn,
  type RankedMemory,
} from "@ugo/memory";
import { decryptText, encryptText, type ChatRequest, type ChatResponse } from "@ugo/shared";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Character } from "./council/character.js";
import type { PackService } from "./packService.js";
import { buildPackPrompt, selfLine } from "./packPrompt.js";
import type { PsycheService } from "./psycheService.js";
import { readGestureOf, replyForReading, type ReadOutcome } from "./sceneReader.js";
import { DiaryService } from "./diaryService.js";
import { NewsService } from "./newsService.js";
import { confirmReminder, parseReminder } from "./volition/reminders.js";
import { dateFor, parseDiaryAsk, tellDiary } from "./volition/diaryAsk.js";
import { parseNewsAsk, tellNews } from "./volition/news.js";
import {
  answerTimer,
  confirmCancel,
  confirmTimer,
  parseTimerCommand,
  type TimerCommand,
} from "./volition/timers.js";
import { confirmList, parseListCommand, type ListCommand } from "./volition/lists.js";
import { searchQueryOf } from "./webSearch.js";

/** top-k per channel (PROGETTO §5.4: k=6 casa, k=10 riunioni) */
// `ticket` is listed for totality over MessageChannel: customer conversations
// go through the reception's own service (ADR-052), never through this one
const K_BY_CHANNEL = { home: 6, meeting: 10, api: 6, ticket: 6 } as const;
const TRANSCRIPT_K = 3;
const HISTORY_TURNS = 8;
/**
 * Turns older than this never come back as "the conversation so far": a
 * thread from last month is memory's job, not the context window's.
 */
const HISTORY_WINDOW_HOURS = 12;
const DIARY_EXCERPT_CHARS = 300;

export class BeingNotFoundError extends Error {}

export interface ChatServiceDeps {
  db: DbClient;
  embedder: EmbeddingsClient;
  llm: LlmClient;
  psyche: PsycheService;
  dataKey: Buffer;
  /** the pack block of the prompt (ADR-014); absent = no pack context */
  pack?: PackService;
  /**
   * ADR-063: la finestra sul mondo — «cerca: …» risposto qui, prima del
   * provider, come il promemoria di ADR-028. Assente = il prefisso non
   * esiste e la frase va al modello come una qualunque.
   */
  web?: { ask: (query: string) => Promise<string | undefined> };
  /**
   * ADR-065: «leggi» — la lettura su gesto esplicito. Il corpo guarda (a
   * 640px), tesseract legge in casa, e la risposta è il testo. Assente = il
   * gesto non esiste e la frase va al modello come una qualunque.
   */
  reader?: { read: () => Promise<ReadOutcome> };
  /**
   * ADR-064: le spinte — «vai in cucina», «chiama Silvio». Non comandi:
   * pressioni che passano dal carattere, e possono essere rifiutate CON una
   * risposta. Solo sul canale di casa; assente = le forme non esistono.
   */
  nudges?: { answer: (text: string, at: Date) => Promise<string | undefined> };
  /**
   * Gruppo 4 — input immagini: il modello vision LOCALE che trasforma la foto
   * in una frase. I pixel muoiono qui: al provider arriva la descrizione.
   * Assente = una foto arriva comunque, ma UGO dice che non riesce a vederla.
   */
  vision?: { describe: (jpegBase64: string) => Promise<string | undefined> };
  /** the household's clock (ADR-019); defaults to the project timezone */
  timezone?: string;
  /**
   * La lingua della casa (ADR-050). Governa come si scrive la data e l'ora che
   * UGO ha davanti — era `"it-IT"` letterale dentro `Intl`, quindi una casa che
   * dichiarava un locale diverso lo vedeva ignorato senza un errore.
   */
  locale?: string;
  /**
   * ADR-032: whose memories, whose thread, whose diary. Two exemplars in one
   * house share the pack and the data key, and share nothing else.
   *
   * Obbligatorio da ADR-048 tempo 2: finché il `DEFAULT` esisteva, ometterlo
   * scriveva sull'esemplare seminato **invece di fallire**.
   */
  gosinoId: string;
  /**
   * ADR-019/048: quale casa. Serve a ciò che è della casa e non
   * dell'esemplare — le registrazioni delle riunioni, che due gosini sotto lo
   * stesso tetto interrogano entrambi.
   *
   * Obbligatorio per la stessa ragione di `gosinoId`: `searchTranscripts` ha
   * girato senza scope, e senza scope quella query attraversava il confine fra
   * famiglie invece di fermarsi al tetto.
   */
  householdId: string;
  /**
   * Chi è questo, dal genoma (ADR-015/031).
   *
   * Obbligatorio e non facoltativo di proposito: un carattere assente è un
   * carattere *medio*, e un default silenzioso è precisamente il modo in cui
   * `trait_sets` è rimasto per mesi una tabella che non pilotava niente. Chi
   * costruisce una chat deve dire di chi è, anche solo per rispondere
   * «`characterFrom({})`, un UGO senza spigoli».
   */
  character: Character;
}

/** Blocks 3+4 of the §5.5 prompt order — dynamic, therefore NEVER cached. */
function buildDynamicSystem(
  now: string,
  view: { label: string; phrase: string },
  diary: { date: string; text: string } | undefined,
  retrieved: readonly RankedMemory[],
  recordings: readonly string[],
  pack: string | undefined,
  character: Character,
): string {
  // the clock goes in the DYNAMIC block and nowhere else: interpolating a time
  // into a cached block would break the cache on every single call (§5.5)
  //
  // E per la stessa ragione ci sta il carattere: `persona` e `maxWords` sono
  // dell'esemplare, e due esemplari sotto lo stesso tetto devono condividere
  // la cache dei blocchi di identità — non spaccarla in una per creatura
  // (regola 2). Il genoma era calcolato e speso solo dal consiglio: in chat
  // un logorroico e un timido rispondevano identici.
  const lines = [
    `Adesso è ${now}.`,
    character.persona,
    `Stato d'animo: ${view.label}. ${view.phrase}`,
  ];
  // the pack comes before the memories: who is in the room decides how a
  // recollection should be said, not the other way round
  if (pack !== undefined && pack !== "") lines.push(pack);
  if (diary !== undefined) {
    lines.push(`Dal diario (${diary.date}): ${diary.text.slice(0, DIARY_EXCERPT_CHARS)}`);
  }
  lines.push(
    retrieved.length > 0
      ? `Ricordi pertinenti:\n${retrieved
          .map((memory) => `- (${memory.createdAt.toISOString().slice(0, 10)}) ${memory.text}`)
          .join("\n")}`
      : "Nessun ricordo pertinente.",
  );
  if (recordings.length > 0) {
    lines.push(`Dalle registrazioni:\n${recordings.map((text) => `- ${text}`).join("\n")}`);
  }
  // Restringe, non contraddice: `rules.it.md` fissa il massimo di frasi ed è
  // cached, quindi vale per tutti. Questo è l'asse che il genoma può muovere
  // senza rinegoziare il formato — fra 18 e 60 parole ci sta la differenza fra
  // uno di poche parole e un logorroico, dentro le stesse due frasi.
  lines.push(`Non superare ${String(character.maxWords)} parole.`);
  return lines.join("\n");
}

export class ChatService {
  public constructor(private readonly deps: ChatServiceDeps) {}

  /**
   * Scopes a query to this exemplar. It used to be allowed to answer
   * `undefined` — «casa con un esemplare solo» — and an `undefined` inside an
   * `and()` disappears, so that branch was a query across every creature on
   * the server. ADR-048 tempo 2 removes the branch with the column DEFAULT
   * that justified it.
   */
  private mine(column: { gosinoId: unknown }): ReturnType<typeof eq> {
    return eq(column.gosinoId as never, this.deps.gosinoId);
  }

  /**
   * The wall clock in the household's timezone (ADR-028).
   *
   * Until now UGO did not know what time it was — not a small gap for someone
   * who is asked "ricordami fra dieci minuti" and who goes to sleep when it
   * gets dark.
   */
  private wallClock(at: Date): { hour: number; minute: number; text: string } {
    const tz = this.deps.timezone ?? "Europe/Rome";
    try {
      return this.formatClock(at, tz);
    } catch {
      // a bad timezone, or an ICU build without the Italian locale, must not
      // be able to swallow a reply: he loses the date, not his voice
      return {
        hour: at.getHours(),
        minute: at.getMinutes(),
        text: at.toISOString().slice(11, 16),
      };
    }
  }

  /**
   * Oggi nel fuso della casa, come lo scrive il sogno (`YYYY-MM-DD`). Con
   * `toISOString()` una domanda fatta alle 23 di sera avrebbe avuto la data di
   * domani, e la pagina di ieri sarebbe stata quella dell'altro ieri.
   */
  private localDate(at: Date): string {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: this.deps.timezone ?? "Europe/Rome",
      }).format(at);
    } catch {
      return at.toISOString().slice(0, 10);
    }
  }

  private formatClock(at: Date, tz: string): { hour: number; minute: number; text: string } {
    const parts = new Intl.DateTimeFormat(this.deps.locale ?? "it-IT", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error("unusable clock");
    return {
      // some ICU builds render midnight as "24": the rest of the system
      // expects 0..23, and an out-of-range hour silently breaks quiet hours
      hour: hour % 24,
      minute,
      text: `${get("weekday")} ${get("day")} ${get("month")}, ore ${get("hour")}:${get("minute")}`,
    };
  }

  /**
   * The last turns of *this* conversation (§5.5 block 5).
   *
   * ADR-067 — la chat di gruppo: sul canale di CASA il filo è della stanza,
   * non della persona. Una stanza è uno spazio condiviso — chi parla sente le
   * risposte date agli altri — quindi UGO rilegge i turni di TUTTI, col nome
   * davanti quando lo sa («Ivan: …»), ed è ciò che gli permette di seguire
   * una conversazione a più voci invece di otto monologhi interlacciati.
   *
   * Sugli altri canali resta lo scoping per persona di ADR-032: una domanda
   * dall'API non deve arrivare col filo di qualcun altro come contesto.
   */
  private async loadHistory(
    channel: ChatRequest["channel"],
    beingId: string | undefined,
    at: Date,
  ): Promise<LlmHistoryTurn[]> {
    const since = new Date(at.getTime() - HISTORY_WINDOW_HOURS * 3_600_000);
    const rows = await this.deps.db
      .select({
        role: messages.role,
        text: messages.text,
        ts: messages.ts,
        speaker: beings.displayName,
      })
      .from(messages)
      .leftJoin(beings, eq(messages.beingId, beings.id))
      .where(
        and(
          this.mine(messages),
          eq(messages.channel, channel),
          gte(messages.ts, since),
          channel === "home"
            ? undefined
            : beingId === undefined
              ? or(isNull(messages.beingId), sql`${messages.role} <> 'user'`)
              : or(eq(messages.beingId, beingId), sql`${messages.role} <> 'user'`),
        ),
      )
      .orderBy(desc(messages.ts), asc(messages.id))
      .limit(HISTORY_TURNS);
    return rows
      .reverse()
      .filter((row): row is typeof row & { role: "user" | "assistant" } =>
        ["user", "assistant"].includes(row.role),
      )
      .map((row) => {
        const text = decryptText(row.text, this.deps.dataKey);
        // il nome davanti solo in gruppo: su un filo per-persona sarebbe rumore
        const named =
          channel === "home" && row.role === "user" && row.speaker !== null
            ? `${row.speaker}: ${text}`
            : text;
        return { role: row.role, content: named };
      });
  }

  /**
   * Who is in the room, as prompt text. Only the beings we can actually name
   * are listed; an unrecognized presence becomes an explicit "do not guess".
   *
   * Apre sempre col nome dell'esemplare, branco o non branco: da quando il
   * blocco `[CACHED]` descrive la specie e non un individuo, questo è l'unico
   * posto in cui una creatura viene nominata, e un ripiego silenzioso qui la
   * lascerebbe senza nome invece che senza compagni.
   */
  private async packBlock(
    beingId: string | undefined,
    channel: ChatRequest["channel"],
  ): Promise<string | undefined> {
    const { pack } = this.deps;
    if (pack === undefined) {
      const [me] = await this.deps.db
        .select({ name: gosini.name, locationLabel: gosini.locationLabel })
        .from(gosini)
        .where(eq(gosini.id, this.deps.gosinoId));
      if (me === undefined) return undefined;
      return selfLine({ ...me, traitVersion: null });
    }
    const present = await pack.present(beingId === undefined ? [] : [beingId]);
    const ids = present.map((being) => being.id);
    return buildPackPrompt({
      self: await pack.self(),
      present,
      relations: await pack.relationsAmong(ids),
      speciesRules: pack.speciesRules(present),
      corrections: await pack.recentCorrections(ids),
      // only at home does an unnamed speaker mean "somebody is here and I do
      // not know who": on the API channel it just means nobody said
      unidentifiedPresent: beingId === undefined && channel === "home",
    });
  }

  /**
   * Esegue il gesto di lista (ADR-076) e registra lo scambio. Nessuna
   * chiamata al provider, quindi **nessuna riga sul `budget_ledger`**: è
   * precisamente il punto — i comandi ricorrenti costano zero e restano in
   * casa.
   */
  private async applyList(
    command: ListCommand,
    request: ChatRequest,
    at: Date,
  ): Promise<ChatResponse> {
    const { db, dataKey } = this.deps;
    const householdId = this.deps.householdId;
    let reply: string;

    if (command.action === "read") {
      const rows = await db
        .select({ text: listItems.text })
        .from(listItems)
        .where(
          and(
            eq(listItems.householdId, householdId),
            eq(listItems.list, command.list),
            eq(listItems.done, false),
          ),
        )
        .orderBy(listItems.at);
      reply = confirmList(
        command,
        rows.map((row) => this.readable(row.text)).filter((text) => text !== ""),
      );
    } else if (command.action === "add") {
      await db.insert(listItems).values({
        householdId,
        list: command.list,
        text: encryptText(command.item ?? "", dataKey),
        ...(request.beingId !== undefined && { beingId: request.beingId }),
      });
      reply = confirmList(command);
    } else {
      // spuntare: si cerca fra le righe aperte quella che combacia, e il
      // confronto avviene in chiaro perché il testo è cifrato a riposo
      const rows = await db
        .select({ id: listItems.id, text: listItems.text })
        .from(listItems)
        .where(
          and(
            eq(listItems.householdId, householdId),
            eq(listItems.list, command.list),
            eq(listItems.done, false),
          ),
        );
      const wanted = (command.item ?? "").toLowerCase();
      const hit = rows.find((row) => this.readable(row.text).toLowerCase().includes(wanted));
      if (hit !== undefined) {
        await db
          .update(listItems)
          .set({ done: true, doneAt: at })
          .where(eq(listItems.id, hit.id));
        reply = confirmList(command);
      } else {
        reply = `Non trovo ${command.item ?? ""} nella lista ${command.list}.`;
      }
    }

    return this.answered(reply, request, at);
  }

  /**
   * ADR-078: mettere, spegnere, chiedere. Un timer È un desiderio con un'ora
   * sopra — la tabella c'era già (ADR-028) — e quello che cambia è chi lo
   * legge: la sentinella del timer, che suona in orario, invece
   * dell'iniziativa, che sceglie il momento buono.
   */
  private async applyTimer(command: TimerCommand, at: Date): Promise<string> {
    const { db } = this.deps;
    const mine = and(
      eq(desires.gosinoId, this.deps.gosinoId),
      eq(desires.kind, command.kind),
      eq(desires.status, "pending"),
    );

    if (command.action === "set") {
      // uno per volta, come una sveglia vera: metterne una seconda sostituisce
      // la prima invece di farne suonare due
      await db.update(desires).set({ status: "expired" }).where(mine);
      /**
       * Una sveglia «alle 7» suona alle 7:00:00. Contando dall'istante in cui
       * l'hai chiesta si portava dietro i suoi secondi e suonava alle 7:00:40:
       * un timer si conta da adesso, un'ora si legge sull'orologio.
       */
      const anchor =
        command.anchor === "orologio" ? new Date(Math.floor(at.getTime() / 60_000) * 60_000) : at;
      await db.insert(desires).values({
        gosinoId: this.deps.gosinoId,
        kind: command.kind,
        status: "pending",
        text: command.label,
        dueAt: new Date(anchor.getTime() + command.inSeconds * 1000),
      });
      return confirmTimer(command);
    }

    const [pending] = await db
      .select({ id: desires.id, text: desires.text, dueAt: desires.dueAt })
      .from(desires)
      .where(mine)
      .orderBy(asc(desires.dueAt))
      .limit(1);

    if (command.action === "cancel") {
      // `expired` e non `done`: un timer spento non è un timer che ha suonato
      if (pending !== undefined) {
        await db.update(desires).set({ status: "expired" }).where(eq(desires.id, pending.id));
      }
      return confirmCancel(command.kind, pending !== undefined);
    }

    const left =
      pending?.dueAt === undefined || pending.dueAt === null
        ? undefined
        : Math.max(0, (pending.dueAt.getTime() - at.getTime()) / 1000);
    return answerTimer(command.kind, left, pending?.text ?? "");
  }

  /**
   * Un gesto risolto in casa: la risposta è già decisa, e quello che resta è
   * la parte che non cambia mai — **lo scambio va in biografia cifrato come
   * ogni altro**. Era copiata cinque volte, una per gesto, e ogni gesto nuovo
   * ne avrebbe aggiunta una sesta: una scorciatoia sul costo non è una
   * scorciatoia sulla memoria, e questo metodo è dove quella promessa smette
   * di dipendere da chi copia bene.
   */
  private async answered(reply: string, request: ChatRequest, at: Date): Promise<ChatResponse> {
    const { db, dataKey, psyche } = this.deps;
    const owner = { gosinoId: this.deps.gosinoId };
    await db.insert(messages).values([
      {
        ...owner,
        ts: at,
        channel: request.channel,
        role: "user",
        beingId: request.beingId ?? null,
        text: encryptText(request.text, dataKey),
      },
      {
        ...owner,
        ts: new Date(at.getTime() + 1),
        channel: request.channel,
        role: "assistant",
        text: encryptText(reply, dataKey),
      },
    ]);
    return { reply, moodLabel: psyche.current(at).label, memoriesUsed: [] };
  }

  /** Il testo di una riga, o stringa vuota se la chiave non la apre. */
  private readable(value: string): string {
    try {
      return decryptText(value, this.deps.dataKey);
    } catch {
      return "";
    }
  }

  public async handle(request: ChatRequest, at: Date = new Date()): Promise<ChatResponse> {
    const { db, embedder, llm, psyche, dataKey } = this.deps;

    // ADR-028: «ricordami di buttare l'acqua alle 13» is a fixed shape in a
    // fixed language. It is answered here, before the provider is ever
    // reached: instant, and it costs nothing. A reminder is filed as a desire
    // with a clock on it, and initiative voices it when the moment comes.
    const wall = this.wallClock(at);

    /**
     * ADR-079: «cos'hai fatto ieri?». La risposta è già scritta — il sogno la
     * distilla ogni notte — e chiederla al provider vorrebbe dire pagare un
     * token per farsi ripetere una cosa che è in casa. Il testo è suo, parola
     * per parola: qui non si riassume il riassunto.
     */
    const diaryAsk = parseDiaryAsk(request.text);
    if (diaryAsk !== undefined) {
      const diary = new DiaryService(db, dataKey);
      const today = this.localDate(at);
      const pages = diaryAsk.book
        ? await diary.pages(this.deps.householdId, this.deps.gosinoId, { limit: 5 })
        : await diary
            .page(this.deps.householdId, this.deps.gosinoId, dateFor(today, diaryAsk.daysAgo))
            .then((page) => (page === undefined ? [] : [page]));
      return this.answered(tellDiary(pages, diaryAsk), request, at);
    }

    /**
     * ADR-080: «che notizie ci sono?». I titoli li ha già scaricati il sogno e
     * sono già le parole di chi li ha scritti: farli riscrivere a un modello
     * costerebbe un token per peggiorarli.
     */
    const newsAsk = parseNewsAsk(request.text);
    if (newsAsk !== undefined) {
      const news = new NewsService(db);
      const [items, subscribed] = await Promise.all([
        news.latest(this.deps.householdId, newsAsk.limit),
        news.subscribed(this.deps.householdId),
      ]);
      return this.answered(tellNews(items, subscribed), request, at);
    }

    /**
     * ADR-076: «aggiungi il latte alla spesa» è un gesto, non una
     * conversazione. Risposto qui, prima del provider: istantaneo, gratuito e
     * privato — e lo scambio finisce comunque nella biografia cifrato come
     * ogni altro, perché una scorciatoia sul costo non è una scorciatoia
     * sulla memoria.
     *
     * **Ultimo fra i gesti che nominano una cosa**, e l'ordine l'hanno deciso
     * due test rossi: «leggimi il diario» finiva qui come «leggimi la lista
     * *diario*», e «leggimi una notizia» come la lista *una notizia*. Le liste
     * sono a testo libero per scelta (ADR-014), quindi possono chiamarsi come
     * qualunque cosa: **le parole che sono di UGO le tiene lui**, e la lista
     * che si chiamasse così si legge nominandone il contenuto.
     */
    const listCommand = parseListCommand(request.text);
    if (listCommand !== undefined) {
      return this.applyList(listCommand, request, at);
    }

    /**
     * ADR-078: «metti un timer di 10 minuti», «svegliami alle 7». Prima del
     * promemoria apposta — «svegliami» è un verbo che appartiene a entrambi,
     * e ADR-028 lo scartava perché non c'era niente da ricordare. Se invece la
     * frase porta anche una cosa da ricordare, il parser del timer si tira
     * indietro da solo e la frase arriva qui sotto intera.
     */
    const timer = parseTimerCommand(request.text, wall.hour, wall.minute);
    if (timer !== undefined) {
      return this.answered(await this.applyTimer(timer, at), request, at);
    }

    const reminder = parseReminder(request.text, wall.hour, wall.minute);
    if (reminder !== undefined) {
      await db.insert(desires).values({
        text: reminder.task,
        status: "pending",
        // ADR-078: da qui in poi la riga dice cosa è. Un promemoria aspetta il
        // momento buono; un timer no — e a leggerli allo stesso modo si
        // sbagliano tutti e due
        kind: "promemoria",
        dueAt: new Date(at.getTime() + reminder.inMinutes * 60_000),
        gosinoId: this.deps.gosinoId,
      });
      // the exchange still goes into the biography, encrypted like every other
      return this.answered(confirmReminder(reminder), request, at);
    }

    // ADR-063: «cerca: …» — la finestra sul mondo, aperta SOLO su gesto
    // esplicito e risposta SENZA provider (SearXNG in casa + sintesi locale).
    // Stessa strada del promemoria: deterministica, e in biografia come tutto
    const query = this.deps.web === undefined ? undefined : searchQueryOf(request.text);
    if (query !== undefined && this.deps.web !== undefined) {
      const reply =
        (await this.deps.web.ask(query)) ??
        "Ho provato a guardare fuori, ma la finestra sul mondo ora non si apre. Grunf.";
      return this.answered(reply, request, at);
    }

    // ADR-065: «leggi» — la lettura su gesto esplicito, stessa famiglia del
    // promemoria e di «cerca:»: risposta PRIMA del provider, zero token, e in
    // biografia cifrata come tutto
    if (this.deps.reader !== undefined && readGestureOf(request.text)) {
      const reply = replyForReading(await this.deps.reader.read());
      return this.answered(reply, request, at);
    }

    // ADR-064: le spinte — stessa famiglia deterministica, stessa strada in
    // biografia. Solo il canale di casa: la reception non arriva qui, e l'API
    // resta fuori finché non decidiamo altrimenti
    if (this.deps.nudges !== undefined && request.channel === "home") {
      const nudged = await this.deps.nudges.answer(request.text, at);
      if (nudged !== undefined) {
        return this.answered(nudged, request, at);
      }
    }

    if (request.beingId !== undefined) {
      const found = await db
        .select({ id: beings.id })
        .from(beings)
        .where(eq(beings.id, request.beingId));
      if (found.length === 0) throw new BeingNotFoundError(request.beingId);
    }

    // gruppo 4 — input immagini: la foto diventa una frase QUI, col modello
    // locale, e al provider arriva solo quella. Se gli occhi locali mancano o
    // sono giù, UGO lo dice invece di fingere di aver visto
    let modelText = request.text;
    if (request.imageBase64 !== undefined) {
      const seen =
        this.deps.vision === undefined
          ? undefined
          : await this.deps.vision.describe(request.imageBase64);
      modelText =
        seen === undefined || seen === ""
          ? `${request.text}\n[Ti hanno mandato una foto, ma i tuoi occhi locali adesso non funzionano: dillo con onestà.]`
          : `${request.text}\n[Nella foto che ti mostrano: ${seen}]`;
    }

    const view = await psyche.applyEventType("conversation_turn", at);
    const retrieved = await searchMemories(
      db,
      embedder,
      request.text,
      K_BY_CHANNEL[request.channel],
      at,
      this.deps.gosinoId,
    );
    // recordings made "in giro" are interrogable through chat (§4.2) — of this
    // house, and only of this house
    const transcripts = await searchTranscripts(
      db,
      embedder,
      request.text,
      TRANSCRIPT_K,
      this.deps.householdId,
    );
    const recordings: string[] = [];
    for (const segment of transcripts) {
      try {
        recordings.push(decryptText(segment.text, dataKey));
      } catch {
        // undecryptable segment (rotated key?): skip, never break the chat
      }
    }
    const diaryRows = await db
      .select({ date: diaryEntries.date, text: diaryEntries.text })
      .from(diaryEntries)
      .where(this.mine(diaryEntries))
      .orderBy(desc(diaryEntries.date))
      .limit(1);

    const history = await this.loadHistory(request.channel, request.beingId, at);
    const result = await llm.chat(
      {
        channel: request.channel,
        dynamicSystem: buildDynamicSystem(
          wall.text,
          view,
          diaryRows[0],
          retrieved,
          recordings,
          await this.packBlock(request.beingId, request.channel),
          this.deps.character,
        ),
        history,
        userText: modelText,
      },
      at,
    );

    // biography is append-only and encrypted at rest (CLAUDE.md rule 6)
    const owner = { gosinoId: this.deps.gosinoId };
    await db.insert(messages).values([
      {
        ...owner,
        ts: at,
        channel: request.channel,
        role: "user",
        beingId: request.beingId ?? null,
        text: encryptText(request.text, dataKey),
      },
      {
        ...owner,
        ts: new Date(at.getTime() + 1),
        channel: request.channel,
        role: "assistant",
        text: encryptText(result.text, dataKey),
        tokensIn:
          (result.usage?.inputTokens ?? 0) +
          (result.usage?.cacheCreationInputTokens ?? 0) +
          (result.usage?.cacheReadInputTokens ?? 0),
        tokensOut: result.usage?.outputTokens ?? 0,
        costUsd: (result.costUsd ?? 0).toFixed(6),
      },
    ]);

    return {
      reply: result.text,
      moodLabel: view.label,
      memoriesUsed: retrieved.map((memory) => memory.id),
    };
  }

  /**
   * Debug/CLI semantic search (GET /v1/memories/search).
   *
   * Scoped to this exemplar like every other retrieval: girava senza
   * `gosinoId`, e `fetchCandidates` dice a chiare lettere che ometterlo
   * significa «i ricordi di tutti» — di ogni creatura e di ogni casa.
   */
  public async search(query: string, k: number): Promise<RankedMemory[]> {
    return searchMemories(
      this.deps.db,
      this.deps.embedder,
      query,
      k,
      new Date(),
      this.deps.gosinoId,
    );
  }

  /** exposed for tests asserting encrypted persistence */
  public async decryptedMessages(ids: string[]): Promise<string[]> {
    const rows = await this.deps.db
      .select({ text: messages.text })
      .from(messages)
      .where(inArray(messages.id, ids));
    return rows.map((row) => decryptText(row.text, this.deps.dataKey));
  }
}
