import {
  serverToFaceSchema,
  type FaceToServerMessage,
  type ServerToFaceMessage,
} from "@ugo/shared/face";
import { DurableQueue } from "./queue.js";

const MAX_QUEUE = 100;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8000;

export interface FaceSocketHandlers {
  onMessage: (message: ServerToFaceMessage) => void;
  onConnected: (connected: boolean) => void;
}

/**
 * WS client with automatic reconnection (exponential backoff) and a bounded
 * store-and-forward queue (PROGETTO §4.1): events raised while offline are
 * flushed in order on reconnect.
 */
export class FaceSocket {
  private socket: WebSocket | undefined;
  // durable: a kiosk reload must not lose events raised while offline
  private readonly queue = new DurableQueue<FaceToServerMessage>("events", MAX_QUEUE);
  private queuedCache = 0;
  private backoffMs = BACKOFF_MIN_MS;
  private closed = false;

  public constructor(
    private readonly url: string,
    private readonly handlers: FaceSocketHandlers,
  ) {}

  /** Opens the durable queue and connects; call once at startup. */
  public async start(): Promise<void> {
    await this.queue.open();
    this.queuedCache = await this.queue.size();
    this.connect();
  }

  public connect(): void {
    if (this.closed) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.backoffMs = BACKOFF_MIN_MS;
      this.handlers.onConnected(true);
      void this.flush();
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        this.handlers.onMessage(serverToFaceSchema.parse(JSON.parse(event.data)));
      } catch {
        // contract violation from the server side: drop the frame
      }
    });

    const scheduleReconnect = (): void => {
      this.handlers.onConnected(false);
      if (this.closed) return;
      setTimeout(() => {
        this.connect();
      }, this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    };
    socket.addEventListener("close", scheduleReconnect);
    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  /** Drains the durable queue in order; anything still failing stays put. */
  private async flush(): Promise<void> {
    for (const item of await this.queue.list()) {
      if (this.socket?.readyState !== WebSocket.OPEN) break;
      this.socket.send(JSON.stringify(item.value));
      await this.queue.remove(item.id);
    }
    this.queuedCache = await this.queue.size();
  }

  public send(message: FaceToServerMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    this.queuedCache += 1;
    void this.queue.push(message);
  }

  /** Cached count: the UI and the e2e hooks need it synchronously. */
  public queuedCount(): number {
    return this.queuedCache;
  }

  public async queuedCountFresh(): Promise<number> {
    this.queuedCache = await this.queue.size();
    return this.queuedCache;
  }

  public close(): void {
    this.closed = true;
    this.socket?.close();
  }
}
