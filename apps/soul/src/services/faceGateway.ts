import { desires, events, type DbClient } from "@ugo/db";
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

export interface FaceGatewayDeps {
  db: DbClient;
  chat: ChatService;
  psyche: PsycheService;
  /** injectable clock so sleep/wake transitions are testable (Zero-Mock: real time otherwise) */
  now?: () => Date;
  /** hour extractor in project TZ; defaults to local hours */
  hourOf?: (at: Date) => number;
}

export type FaceSender = (message: ServerToFaceMessage) => void;

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
   * ADR-027: soul decides an initiative, the body performs it. A face that
   * does not know the gesture drops it — the decision must not depend on which
   * renderer happens to be running.
   */
  public broadcastGesture(id: string): void {
    for (const send of this.senders) {
      send({ type: "gesture", id });
    }
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
      .where(and(eq(events.type, "wants_out"), gte(events.ts, since)))
      .limit(1);
    return rows.length > 0;
  }

  private async recordEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.db.insert(events).values({ source: "face", type, payload });
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
      .where(eq(desires.status, "pending"))
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

  public async handle(message: FaceToServerMessage, send: FaceSender): Promise<void> {
    const at = this.now();
    switch (message.type) {
      case "heard_text": {
        this.setState("thinking", send);
        const response = await this.deps.chat.handle({ channel: "home", text: message.text }, at);
        this.setState("talking", send);
        send({ type: "speak", text: response.reply });
        this.pushMood(send);
        this.setState("idle", send);
        return;
      }
      case "face_seen": {
        await this.recordEvent("face_seen", {});
        await this.deps.psyche.applyEventType("presence_detected", at);
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
        await this.recordEvent("noise", { db: message.db });
        // ADR-029: the body is the one holding the room's noise floor, so a
        // `noise` frame already means "this startled me". Re-judging it here
        // against an absolute threshold threw away the only calibrated
        // information in the system — and on a phone with AGC, an
        // uncalibrated number means nothing anyway.
        {
          await this.deps.psyche.applyEventType("loud_noise", at);
          if (this.state !== "sleeping") this.setState("alert", send);
          this.pushMood(send);
        }
        return;
      }
      case "tap": {
        await this.recordEvent("tap", {});
        if (this.state === "sleeping") this.setState("idle", send);
        else this.setState("alert", send);
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
    }
  }
}
