import { desires, events, type DbClient } from "@ugo/db";
import {
  DARKNESS_LUX,
  GLYPH_FOR_STATE,
  NIGHT_START_HOUR,
  NOISE_ALERT_DB,
  faceToServerSchema,
  type FaceState,
  type FaceToServerMessage,
  type ServerToFaceMessage,
} from "@ugo/shared";
import { asc, eq } from "drizzle-orm";
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
        if (message.db >= NOISE_ALERT_DB) {
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
      case "shake": {
        await this.recordEvent("shake", {});
        await this.deps.psyche.applyEventType("shake", at);
        this.pushMood(send);
        return;
      }
    }
  }
}
