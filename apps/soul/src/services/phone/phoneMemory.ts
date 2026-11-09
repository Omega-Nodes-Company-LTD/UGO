import { randomUUID } from "node:crypto";
import type { LlmHistoryTurn } from "@ugo/memory";
import { AUDIO_TTL_MS } from "./phoneCrypto.js";

/**
 * Ciò che il telefono tiene a mente, e solo in memoria (ADR-128).
 *
 * L'audio vive dieci minuti: il tempo che Twilio lo scarichi. Il contesto di
 * un chiamante sconosciuto vive quanto la chiamata: nessuna sua parola tocca
 * il disco, perché la minimizzazione per chi non è cliente vuol dire questo.
 * Entrambi hanno un tetto, perché la memoria di un processo non è infinita e
 * una chiamata appesa non deve diventare una perdita.
 */

const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const CALL_TTL_MS = 30 * 60_000;
const MAX_CALLS = 500;
const MAX_TURNS = 8;

export class PhoneAudioStore {
  private readonly items = new Map<string, { audio: Buffer; expiresAt: number }>();
  private bytes = 0;

  public put(audio: Buffer, now: number): { id: string; expiresAt: number } {
    this.sweep(now);
    const id = randomUUID();
    const expiresAt = now + AUDIO_TTL_MS;
    this.items.set(id, { audio, expiresAt });
    this.bytes += audio.length;
    // oltre il tetto se ne vanno i più vecchi: l'ordine d'inserimento di una Map è il loro
    for (const [oldId, item] of this.items) {
      if (this.bytes <= MAX_AUDIO_BYTES || oldId === id) break;
      this.items.delete(oldId);
      this.bytes -= item.audio.length;
    }
    return { id, expiresAt };
  }

  public get(id: string, now: number): Buffer | undefined {
    const item = this.items.get(id);
    if (item === undefined) return undefined;
    if (item.expiresAt < now) {
      this.items.delete(id);
      this.bytes -= item.audio.length;
      return undefined;
    }
    return item.audio;
  }

  private sweep(now: number): void {
    for (const [id, item] of this.items) {
      if (item.expiresAt >= now) continue;
      this.items.delete(id);
      this.bytes -= item.audio.length;
    }
  }
}

export class CallMemory {
  private readonly calls = new Map<string, { turns: LlmHistoryTurn[]; lastAt: number }>();

  public history(callRef: string, now: number): LlmHistoryTurn[] {
    const call = this.calls.get(callRef);
    if (call === undefined || now - call.lastAt > CALL_TTL_MS) return [];
    return [...call.turns];
  }

  public remember(callRef: string, user: string, assistant: string, now: number): void {
    for (const [ref, call] of this.calls) {
      if (now - call.lastAt > CALL_TTL_MS) this.calls.delete(ref);
    }
    const turns = [...this.history(callRef, now), { role: "user" as const, content: user }];
    turns.push({ role: "assistant", content: assistant });
    this.calls.delete(callRef);
    this.calls.set(callRef, { turns: turns.slice(-MAX_TURNS), lastAt: now });
    if (this.calls.size > MAX_CALLS) {
      const oldest = this.calls.keys().next().value;
      if (oldest !== undefined) this.calls.delete(oldest);
    }
  }
}
