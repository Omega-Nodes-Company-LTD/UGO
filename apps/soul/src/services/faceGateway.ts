import { desires, events, unknownPrints, type DbClient } from "@ugo/db";
import {
  DARKNESS_LUX,
  GLYPH_FOR_STATE,
  NIGHT_START_HOUR,
  faceToServerSchema,
  type FaceState,
  type FaceToServerMessage,
  type GlyphPattern,
  type ServerToFaceMessage,
} from "@ugo/shared";
import { and, asc, eq, gte } from "drizzle-orm";
import type { ChatService } from "./chatService.js";
import type { PsycheService } from "./psycheService.js";
import { voiceAskOpen, type VoiceSampleResult } from "./voiceEnrolment.js";

export interface FaceGatewayDeps {
  /** ADR-032: which exemplar this gateway is the body of (ADR-048 tempo 2: required) */
  gosinoId: string;
  db: DbClient;
  chat: ChatService;
  psyche: PsycheService;
  /** injectable clock so sleep/wake transitions are testable (Zero-Mock: real time otherwise) */
  now?: () => Date;
  /** hour extractor in project TZ; defaults to local hours */
  hourOf?: (at: Date) => number;
  /**
   * ADR-045: chi sta parlando. Facoltativo — una casa senza il servizio di
   * percezione, o che non vuole la biometria, continua a funzionare
   * esattamente come prima: UGO risponde senza sapere chi ha davanti.
   */
  recognition?: {
    byVoice: (audioBase64: string) => Promise<{ beingId?: string | undefined } | undefined>;
    /** ADR-057: chi è questo volto, dal ritaglio che il corpo ha già fatto */
    byFace?: (imageBase64: string) => Promise<{ beingId?: string | undefined } | undefined>;
    /** ADR-057: non lo conosciamo — conserva l'impronta, cifrata, e conta */
    rememberUnknownFace?: (
      imageBase64: string,
    ) => Promise<{ printId: string; seenCount: number } | undefined>;
  };
  /**
   * ADR-058: cosa fare quando gli danno una mela, oltre a esserne contento.
   *
   * Iniettata invece che costruita qui perché tocca due cose che il gateway non
   * possiede: il **legame** con chi c'è nella stanza (`bonds`, che è del branco)
   * e il **peso** dell'ultimo atto (`act_efficacy`, che è della volontà).
   * Assente = la mela resta un buon momento e nient'altro, che è un ripiego
   * onesto e non un mezzo servizio.
   */
  reward?: (input: { act?: string | undefined; at: Date }) => Promise<void>;
  /**
   * ADR-057, la seconda metà: dove va a finire un campione di voce arrivato
   * dal chiosco. Iniettata perché il deposito tocca il bucket, che il gateway
   * non possiede. Assente = il frame `voice_sample` si ignora — una casa senza
   * object storage non può arruolare voci, dal pannello come dal chiosco.
   */
  voiceSample?: (input: { beingId: string; audio: Buffer }) => Promise<VoiceSampleResult>;
}

export type FaceSender = (message: ServerToFaceMessage) => void;

/**
 * Quante volte deve rivederti prima di chiedere chi sei (ADR-057).
 *
 * Due e non una. Al primo passaggio davanti alla camera finiscono il corriere,
 * un riflesso nello specchio e chi ha sbagliato porta: una creatura che chiede
 * il nome di ognuno di loro è una creatura che si spegne dopo tre giorni.
 */
const ASK_AFTER_SIGHTINGS = 2;

/**
 * Le sue parole, non quelle del modello: chiedere chi sei costa zero token.
 *
 * Scritta come un desiderio e non come una frase spedita subito, perché
 * l'iniziativa ha già le sue regole su **quando** è il momento di dire qualcosa
 * — le ore di quiete, il raffreddamento, la soglia. Una domanda che salta
 * quelle regole è una domanda che arriva alle tre di notte.
 */
const ASK_WHO = "Chiedi chi è quella persona che hai visto e non conosci.";

/**
 * Creature-level face state machine (PROGETTO §4.1, §5.3):
 * lights_off && ora>22 → sleeping; volto rilevato da sleeping → risveglio
 * con saluto contestuale (usa un desire pendente, a costo zero token).
 */
export class FaceGateway {
  private state: FaceState = "idle";
  /** which shell the body is in; a change is an event, not a setting */
  private mode: "home" | "portable" = "home";
  private readonly senders = new Set<FaceSender>();
  /**
   * Gruppo 12: l'ultimo sguardo della stanza, SOLO in memoria e consumato a
   * ogni lettura — uno sguardo non si archivia, si guarda. Mai nel database,
   * mai nei log: la frase che ne nasce sì (è un pensiero della ruminazione),
   * i pixel no.
   */
  private glimpse: { at: number; image: string } | undefined;

  public constructor(private readonly deps: FaceGatewayDeps) {}

  public registerSender(send: FaceSender): void {
    this.senders.add(send);
  }

  public unregisterSender(send: FaceSender): void {
    this.senders.delete(send);
  }

  /**
   * ADR-013 (opzione b): meeting answers are voiced by the home body — every
   * connected face speaks the text through its on-device TTS.
   */
  public broadcastSpeak(text: string): void {
    for (const send of this.senders) {
      send({ type: "speak", text });
    }
  }

  /**
   * Gruppo 12: parla nel sonno. La nuvoletta senza la voce — il muso mostra
   * e il registro ricorda, ma il TTS non parte: un borbottio che sveglia la
   * casa non è un borbottio, è una sveglia.
   */
  public broadcastMurmur(text: string): void {
    for (const send of this.senders) {
      send({ type: "speak", text, murmur: true });
    }
  }

  /**
   * ADR-027: soul decides an initiative, the body performs it. A face that
   * does not know the gesture drops it — the decision must not depend on which
   * renderer happens to be running.
   */
  public broadcastGesture(id: string): void {
    for (const send of this.senders) {
      send({ type: "gesture", id });
    }
  }

  /**
   * ADR-057, la seconda metà: «fatti sentire la voce», detto dal chiosco.
   *
   * Parte dal claim del volto nel pannello, ma l'invito appare dove la persona
   * sta davvero — sullo schermo del corpo. Ogni corpo connesso lo mostra; la
   * finestra che lo rende valido la tiene soul (`voiceAskOpen`), non il corpo.
   */
  public broadcastAskVoice(beingId: string, name: string): void {
    for (const send of this.senders) {
      send({ type: "enroll_voice", beingId, name });
    }
  }

  /** Gruppo 12: «fammi dare un'occhiata» — lo sguardo si chiede, mai si prende. */
  public askGlimpse(): void {
    for (const send of this.senders) {
      send({ type: "glimpse_ask" });
    }
  }

  /** L'ultimo sguardo se è fresco, e poi non c'è più: si guarda una volta. */
  public takeGlimpse(maxAgeMs: number, at: Date = new Date()): string | undefined {
    const held = this.glimpse;
    this.glimpse = undefined;
    if (held === undefined || at.getTime() - held.at > maxAgeMs) return undefined;
    return held.image;
  }

  /** The one act that carries across the room without being looked at. */
  public broadcastGlyph(pattern: GlyphPattern): void {
    for (const send of this.senders) {
      send({ type: "glyph", pattern });
    }
  }

  /** True when at least one body is connected: someone could plausibly see him. */
  public hasBody(): boolean {
    return this.senders.size > 0;
  }

  public currentState(): FaceState {
    return this.state;
  }

  /** current mood snapshot for the connection hello */
  public psycheView(): { vars: Record<string, number>; label: string } {
    const { vars, label } = this.deps.psyche.current(this.now());
    return { vars, label };
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private hour(at: Date): number {
    return this.deps.hourOf?.(at) ?? at.getHours();
  }

  /** Did he ask to go out in the last few hours? (ADR-030) */
  private async askedToGoOutRecently(at: Date): Promise<boolean> {
    const since = new Date(at.getTime() - 6 * 3_600_000);
    const rows = await this.deps.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.type, "wants_out"), gte(events.ts, since), this.mine(events)))
      .limit(1);
    return rows.length > 0;
  }

  private async recordEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.db.insert(events).values({
      source: "face",
      type,
      payload,
      gosinoId: this.deps.gosinoId,
    });
  }

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

  private setState(state: FaceState, send: FaceSender): void {
    if (this.state === state) return;
    this.state = state;
    send({ type: "state", state });
    // the Glyph is the state seen from across the room (§4.1); the face
    // degrades silently when the device has no Glyph SDK
    const pattern = GLYPH_FOR_STATE[state];
    if (pattern !== undefined) send({ type: "glyph", pattern });
  }

  private pushMood(send: FaceSender): void {
    const { vars, label } = this.deps.psyche.current(this.now());
    send({ type: "mood", label, vars });
  }

  private async wakeUpGreeting(): Promise<string> {
    const pending = await this.deps.db
      .select({ id: desires.id, text: desires.text })
      .from(desires)
      .where(and(eq(desires.status, "pending"), this.mine(desires)))
      .orderBy(asc(desires.createdAt))
      .limit(1);
    const desire = pending[0];
    if (desire === undefined) return "Grunf... bentornato, mi ero appisolato.";
    // proactivity (Fase 3): a desire voiced out loud is fulfilled, not repeated
    await this.deps.db.update(desires).set({ status: "done" }).where(eq(desires.id, desire.id));
    return `Grunf... buongiorno! Mi ero segnato una cosa: ${desire.text}`;
  }

  /** Entry point for one raw WS text frame. Returns false on invalid input. */
  public async handleRaw(raw: string, send: FaceSender): Promise<boolean> {
    let parsed: FaceToServerMessage;
    try {
      parsed = faceToServerSchema.parse(JSON.parse(raw));
    } catch {
      return false; // contract violation: ignore frame, never crash the socket
    }
    await this.handle(parsed, send);
    return true;
  }

  /**
   * ADR-057: c'è una faccia davanti alla camera. Chi è?
   *
   * Tre esiti, e il terzo è quello nuovo:
   *
   * 1. **la conosciamo** → non c'è niente da fare qui; chi è finisce nel prompt
   *    per la strada che esiste già;
   * 2. **non la conosciamo e l'abbiamo vista una volta sola** → si conserva
   *    l'impronta e basta. Chiedere al primo passaggio significherebbe chiedere
   *    del corriere, del riflesso in uno specchio e di chi ha sbagliato porta;
   * 3. **non la conosciamo e ripassa** → si scrive un desiderio, e l'iniziativa
   *    lo dirà a voce quando è il momento. Il canale è quello che c'è già
   *    (`desires` + `speakDesire`), perché una domanda che UGO fa è una cosa
   *    che UGO **vuole dire**, non un canale nuovo.
   *
   * Non solleva mai: il riconoscimento è un di più, e una camera che non
   * funziona non deve poter spegnere la presenza.
   */
  private async aboutThisFace(image: string, at: Date): Promise<void> {
    const recognition = this.deps.recognition;
    if (recognition?.rememberUnknownFace === undefined) return;
    try {
      const known = await recognition.byFace?.(image);
      if (known?.beingId !== undefined) return;
      const kept = await recognition.rememberUnknownFace(image);
      if (kept === undefined || kept.seenCount < ASK_AFTER_SIGHTINGS) return;

      const [already] = await this.deps.db
        .select({ id: unknownPrints.id, askedAt: unknownPrints.askedAt })
        .from(unknownPrints)
        .where(eq(unknownPrints.id, kept.printId));
      if (already?.askedAt != null) return;
      if (already === undefined) return;

      await this.deps.db.insert(desires).values({
        gosinoId: this.deps.gosinoId,
        text: ASK_WHO,
        dueHint: "quando c'è qualcuno",
      });
      // marcato **prima** che la domanda venga detta: se la si marcasse dopo,
      // un riavvio in mezzo produrrebbe la stessa domanda ogni sera
      await this.deps.db
        .update(unknownPrints)
        .set({ askedAt: at })
        .where(eq(unknownPrints.id, kept.printId));
    } catch {
      // servizio spento, modello non caricato, rete: si continua senza sapere
      // chi è, che è esattamente quel che si faceva prima di ADR-057
    }
  }

  public async handle(message: FaceToServerMessage, send: FaceSender): Promise<void> {
    const at = this.now();
    switch (message.type) {
      case "heard_text": {
        this.setState("thinking", send);
        // ADR-045: il pezzo che mancava. `chat.handle` accetta un `beingId` da
        // sempre e ha sempre ricevuto `undefined`, perché sul percorso dal vivo
        // non arrivava audio e nessuno lo identificava — quindi il prompt
        // diceva a UGO, a ogni turno, di non tirare a indovinare chi fossi.
        const who =
          message.audio === undefined
            ? undefined
            : (await this.deps.recognition?.byVoice(message.audio))?.beingId;
        const response = await this.deps.chat.handle(
          { channel: "home", text: message.text, ...(who !== undefined && { beingId: who }) },
          at,
        );
        this.setState("talking", send);
        send({ type: "speak", text: response.reply });
        this.pushMood(send);
        this.setState("idle", send);
        return;
      }
      case "face_seen": {
        await this.recordEvent("face_seen", {});
        await this.deps.psyche.applyEventType("presence_detected", at);
        // ADR-057: c'è una faccia. Se non la conosciamo, la conserva cifrata e
        // — quando l'ha già rivista — **te lo chiede**, invece di aspettare che
        // qualcuno apra il pannello e compili un modulo.
        if (message.image !== undefined) await this.aboutThisFace(message.image, at);
        if (this.state === "sleeping") {
          this.setState("alert", send);
          send({ type: "speak", text: await this.wakeUpGreeting() });
          this.setState("idle", send);
        }
        this.pushMood(send);
        return;
      }
      case "light": {
        await this.recordEvent("light", { lux: message.lux });
        if (message.lux <= DARKNESS_LUX && this.hour(at) >= NIGHT_START_HOUR) {
          this.setState("sleeping", send);
        }
        return;
      }
      case "noise": {
        // ADR-056 (gruppo 10): se QUESTA creatura era già dietro un riparo, il
        // colpo arriva attutito. La lista porta i `who` della stanza: il mio id
        // se il registro c'è, `""` per la casa a esemplare solo — che è l'unico
        // caso in cui `""` può comparire, quindi non serve contare i presenti.
        const sheltered =
          message.sheltered?.some((who) => who === this.deps.gosinoId || who === "") ?? false;
        await this.recordEvent("noise", { db: message.db, sheltered });
        // ADR-029: the body is the one holding the room's noise floor, so a
        // `noise` frame already means "this startled me". Re-judging it here
        // against an absolute threshold threw away the only calibrated
        // information in the system — and on a phone with AGC, an
        // uncalibrated number means nothing anyway.
        {
          await this.deps.psyche.applyEventType(sheltered ? "loud_noise_muffled" : "loud_noise", at);
          if (this.state !== "sleeping") this.setState("alert", send);
          this.pushMood(send);
        }
        return;
      }
      case "tap": {
        await this.recordEvent("tap", {});
        // ADR-058: la carezza tocca la psiche, e finora non la toccava. Il
        // corpo festeggiava già con `happyGrunt` (`autonomy.ts`), l'evento
        // `compliment` esisteva **e non lo emetteva nessuno**: il gesto più
        // frequente che una persona fa a UGO era l'unico che non lo cambiava.
        await this.deps.psyche.applyEventType("compliment", at);
        if (this.state === "sleeping") this.setState("idle", send);
        else this.setState("alert", send);
        this.pushMood(send);
        return;
      }
      case "reward": {
        // ADR-058: la mela. Un premio deliberato — bersaglio piccolo, sul muso —
        // e non una carezza più forte: scalda il **legame** con chi gliel'ha
        // data e pesa **l'atto** che se l'è meritata.
        if (this.state === "sleeping") {
          // svegliare qualcuno per premiarlo è un premio per chi lo dà
          send({ type: "speak", text: "Zzz... grunf?" });
          return;
        }
        await this.recordEvent("reward", { act: message.act ?? null });
        await this.deps.psyche.applyEventType("reward", at);
        for (const other of this.senders) other({ type: "gesture", id: "wiggle" });
        await this.deps.reward?.({ act: message.act, at });
        this.pushMood(send);
        return;
      }
      case "mode": {
        // ADR-030: he could ask to go out and never learn that he had been
        // taken. The body is the only thing that knows which shell it is in.
        if (message.mode === this.mode) return;
        this.mode = message.mode;
        if (message.mode === "portable") {
          const asked = await this.askedToGoOutRecently(at);
          await this.recordEvent("went_out", { asked });
          await this.deps.psyche.applyEventType("went_out", at);
          // he asked, and he was taken: that is worth saying out loud
          if (asked) {
            for (const other of this.senders) other({ type: "gesture", id: "spin" });
            send({ type: "speak", text: "Grunf! Si esce!" });
          }
        } else {
          await this.recordEvent("came_home", {});
          await this.deps.psyche.applyEventType("came_home", at);
        }
        this.pushMood(send);
        return;
      }
      case "shake": {
        await this.recordEvent("shake", {});
        await this.deps.psyche.applyEventType("shake", at);
        this.pushMood(send);
        return;
      }
      case "glimpse": {
        // gruppo 12: lo sguardo chiesto è arrivato. In memoria e basta — la
        // ruminazione lo consumerà al prossimo battito; nessun evento, perché
        // un'immagine non è un fatto finché qualcuno non l'ha guardata
        this.glimpse = { at: at.getTime(), image: message.image };
        return;
      }
      case "seen_object": {
        // gruppo 12: ha visto una cosa. Il corpo ha già reagito da solo (zero
        // token); qui resta la traccia — categoria e basta, mai un'immagine —
        // così il sogno e la ruminazione possono raccontarla domani
        await this.recordEvent("seen_object", { kind: message.kind });
        return;
      }
      case "voice_sample": {
        // ADR-057: biometria dal chiosco SOLO dentro la finestra aperta dal
        // claim del volto. Fuori finestra il frame si ignora e si annota — un
        // corpo che deposita voci quando vuole non è un corpo, è un
        // registratore abusivo. Solo id nel registro, mai l'audio (regola 6).
        const store = this.deps.voiceSample;
        if (store === undefined) return;
        if (!(await voiceAskOpen(this.deps.db, message.beingId, at))) {
          await this.recordEvent("voice_sample_rejected", { beingId: message.beingId });
          return;
        }
        const stored = await store({
          beingId: message.beingId,
          audio: Buffer.from(message.audio, "base64"),
        });
        await this.recordEvent("voice_sample", {
          beingId: message.beingId,
          outcome: stored.outcome,
        });
        if (stored.outcome === "queued") {
          send({ type: "speak", text: "Grunf, ti ho sentito! Stanotte imparo la tua voce." });
        }
        return;
      }
      case "used_prop": {
        // ADR-056: il corpo ha deciso da solo di andare sul cuscino, e lo
        // dichiara. È l'unico evento che la creatura si procura da sé, quindi
        // è anche l'unico che potrebbe farsi da solo la propria psiche: il
        // `ceiling` su `used_prop` è ciò che chiude quell'anello.
        await this.recordEvent("used_prop", { kind: message.kind });
        await this.deps.psyche.applyEventType("used_prop", at);
        // gruppo 10: il cuscino in più è un pisolino — energia col suo tetto.
        // Additivo e non sostitutivo: il cuscino resta anche un passatempo
        if (message.kind === "cushion") await this.deps.psyche.applyEventType("napped", at);
        this.pushMood(send);
        return;
      }
    }
  }
}
