import {
  serverToFaceSchema,
  type FaceToServerMessage,
  type ServerToFaceMessage,
} from "@ugo/shared/face";
import { DurableQueue } from "./queue.js";

const MAX_QUEUE = 100;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8000;
/** Quanto spesso si ritenta lo svuotamento della coda quando non è vuota. */
const RESEND_INTERVAL_MS = 5_000;
/**
 * Watchdog zombie (ADR-045): se il socket sta "su" ma non arriva NESSUN
 * frame per questo tempo, si chiude e ci si riconnette. Una rete morta non
 * emette `close` né `error` — il kiosk mostrava «connesso» con UGO muto.
 */
const ZOMBIE_TIMEOUT_MS = 60_000;

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
  /** tolleranza sul watchdog: resetta a ogni frame ricevuto */
  private lastActivityAt = 0;
  private timers: { resend?: ReturnType<typeof setInterval>; watchdog?: ReturnType<typeof setInterval> } = {};

  public constructor(
    private readonly url: string,
    private readonly handlers: FaceSocketHandlers,
  ) {}

  /** Opens the durable queue and connects; call once at startup. */
  public async start(): Promise<void> {
    await this.queue.open();
    this.queuedCache = await this.queue.size();
    // flush periodico: se il socket cade A METÀ dello svuotamento, il prossimo
    // `open` riparte da dov'era — ma se l'`open` non arriva mai, la coda non
    // deve restare piena per sempre (perdita di eventi di presenza/carezza)
    this.timers.resend = setInterval(() => {
      void this.flush();
    }, RESEND_INTERVAL_MS);
    // watchdog zombie: un socket che non riceve nulla per troppo tempo è un
    // filo morto, e il kiosk non deve mostrare «connesso» con UGO muto
    this.timers.watchdog = setInterval(() => {
      const now = Date.now();
      if (
        this.socket?.readyState === WebSocket.OPEN &&
        now - this.lastActivityAt > ZOMBIE_TIMEOUT_MS
      ) {
        this.socket.close();
      }
    }, RESEND_INTERVAL_MS);
    this.poke();
    this.connect();
  }

  /** segna l'attività: ogni frame ricevuto (e ogni `open`) tiene vivo il filo */
  private poke(): void {
    this.lastActivityAt = Date.now();
  }

  public connect(): void {
    if (this.closed) return;
    // guard doppio-socket: se uno è già CONNECTING o OPEN non ne apriamo un
    // altro — il vecchio handler `close` farebbe partire una riconnessione
    // fantasma e ci ritroveremmo con due fili per lo stesso corpo.
    const current = this.socket;
    if (current !== undefined && (current.readyState === WebSocket.CONNECTING || current.readyState === WebSocket.OPEN)) {
      return;
    }
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.backoffMs = BACKOFF_MIN_MS;
      this.poke();
      this.handlers.onConnected(true);
      void this.flush();
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      this.poke();
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
    if (this.timers.resend !== undefined) clearInterval(this.timers.resend);
    if (this.timers.watchdog !== undefined) clearInterval(this.timers.watchdog);
    this.socket?.close();
  }
}
