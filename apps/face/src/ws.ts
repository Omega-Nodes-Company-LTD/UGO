import {
  serverToFaceSchema,
  type FaceToServerMessage,
  type ServerToFaceMessage,
} from "@ugo/shared/face";

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
  private queue: FaceToServerMessage[] = [];
  private backoffMs = BACKOFF_MIN_MS;
  private closed = false;

  public constructor(
    private readonly url: string,
    private readonly handlers: FaceSocketHandlers,
  ) {}

  public connect(): void {
    if (this.closed) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.backoffMs = BACKOFF_MIN_MS;
      this.handlers.onConnected(true);
      const pending = [...this.queue];
      this.queue = [];
      for (const message of pending) this.send(message);
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

  public send(message: FaceToServerMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(message);
  }

  public queuedCount(): number {
    return this.queue.length;
  }

  public close(): void {
    this.closed = true;
    this.socket?.close();
  }
}
