import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaceSocket } from "./ws.js";

/**
 * `FaceSocket` parla solo Web API (WebSocket, IndexedDB via `DurableQueue`):
 * nei test Node si stubba il WebSocket globale, come già si fa per
 * SpeechRecognition in `speech.test.ts` (Web API assenti qui). La classe è
 * pura: niente DB, niente rete vera.
 */

class FakeWebSocket {
  public static CONNECTING = 0;
  public static OPEN = 1;
  public static CLOSING = 2;
  public static CLOSED = 3;
  public static born: FakeWebSocket[] = [];

  public readyState = FakeWebSocket.CONNECTING;
  public sent: string[] = [];
  private readonly handlers: Record<string, (event?: unknown) => void> = {};

  public constructor(public readonly url: string) {
    FakeWebSocket.born.push(this);
  }

  public addEventListener(name: string, handler: (event?: unknown) => void): void {
    this.handlers[name] = handler;
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public dispatch(name: string, event?: unknown): void {
    this.handlers[name]?.(event);
  }

  /** il test apre il socket come farebbe il browser */
  public open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.handlers.open?.({});
  }

  public close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.handlers.close?.({});
  }
}

const last = (): FakeWebSocket => {
  const instance = FakeWebSocket.born.at(-1);
  if (instance === undefined) throw new Error("no socket was ever created");
  return instance;
};

describe("FaceSocket — riconnessione e coda", () => {
  beforeEach(() => {
    FakeWebSocket.born = [];
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).WebSocket;
  });

  it("send() mette in coda quando il socket non è ancora aperto", async () => {
    const onConnected = vi.fn();
    const onMessage = vi.fn();
    const socket = new FaceSocket("ws://x", { onConnected, onMessage });
    await socket.start();

    socket.send({ type: "tap" });
    expect(onConnected).not.toHaveBeenCalled();
    // il frame non è partito: readyState è CONNECTING
    expect(last().sent).toEqual([]);

    last().open();
    await vi.runOnlyPendingTimersAsync();
    expect(last().sent).toContain(JSON.stringify({ type: "tap" }));
  });

  it("guard doppio-socket: connect() mentre uno è CONNECTING non ne crea un secondo", async () => {
    const socket = new FaceSocket("ws://x", { onConnected: vi.fn(), onMessage: vi.fn() });
    await socket.start();
    const first = last();

    socket.connect();
    expect(FakeWebSocket.born).toHaveLength(1);

    first.open();
    socket.connect();
    expect(FakeWebSocket.born).toHaveLength(1);
  });

  it("watchdog: chiude da solo un socket zombie (nessun frame per ZOMBIE_TIMEOUT)", async () => {
    const onConnected = vi.fn();
    const socket = new FaceSocket("ws://x", { onConnected, onMessage: vi.fn() });
    await socket.start();
    const first = last();
    first.open();

    // nessun frame arriva: dopo il timeout il watchdog deve chiudere il filo
    const close = vi.spyOn(first, "close");
    await vi.advanceTimersByTimeAsync(5_000 * 13); // 65s > 60s di soglia
    expect(close).toHaveBeenCalled();
  });

  it("il flush periodico svuota la coda anche se l'open è stato perso", async () => {
    const socket = new FaceSocket("ws://x", { onConnected: vi.fn(), onMessage: vi.fn() });
    await socket.start();
    socket.send({ type: "tap" });
    const first = last();
    first.open();
    await vi.runOnlyPendingTimersAsync();
    expect(first.sent).toContain(JSON.stringify({ type: "tap" }));
    expect(socket.queuedCount()).toBe(0);
  });
});