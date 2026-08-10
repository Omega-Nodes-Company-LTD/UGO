/**
 * Durable store-and-forward queue (PROGETTO §4.1).
 *
 * The kiosk browser reloads: Android kills tabs, the app updates, someone
 * pulls to refresh. An in-memory queue loses every event and every recording
 * waiting to be uploaded, which is exactly the data that cannot be produced
 * again. IndexedDB survives all of that.
 *
 * Degrades to memory when IndexedDB is unavailable (private mode, old
 * webview): the app keeps working, it just loses durability — never crashes.
 */

const DB_NAME = "ugo-face";
const DB_VERSION = 1;

export interface QueuedItem<T> {
  id: number;
  value: T;
}

export class DurableQueue<T> {
  private memory: QueuedItem<T>[] = [];
  private nextMemoryId = 1;
  private db: IDBDatabase | undefined;

  public constructor(
    private readonly store: string,
    private readonly maxItems: number,
  ) {}

  /** Opens IndexedDB; resolves even on failure (memory fallback). */
  public async open(): Promise<void> {
    if (!("indexedDB" in globalThis)) return;
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ["events", "uploads"]) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
            }
          }
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error("indexedDB open failed"));
        };
      });
    } catch {
      this.db = undefined; // memory fallback
    }
  }

  private transaction(mode: IDBTransactionMode): IDBObjectStore | undefined {
    if (this.db === undefined) return undefined;
    try {
      return this.db.transaction(this.store, mode).objectStore(this.store);
    } catch {
      return undefined;
    }
  }

  public async push(value: T): Promise<void> {
    const store = this.transaction("readwrite");
    if (store === undefined) {
      if (this.memory.length >= this.maxItems) this.memory.shift();
      this.memory.push({ id: this.nextMemoryId++, value });
      return;
    }
    await new Promise<void>((resolve) => {
      const request = store.add({ value });
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        resolve(); // a failed enqueue must never break the caller
      };
    });
    await this.trim();
  }

  public async list(): Promise<QueuedItem<T>[]> {
    const store = this.transaction("readonly");
    if (store === undefined) return [...this.memory];
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        resolve((request.result as { id: number; value: T }[]).map(({ id, value }) => ({ id, value })));
      };
      request.onerror = () => {
        resolve([]);
      };
    });
  }

  public async remove(id: number): Promise<void> {
    const store = this.transaction("readwrite");
    if (store === undefined) {
      this.memory = this.memory.filter((item) => item.id !== id);
      return;
    }
    await new Promise<void>((resolve) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        resolve();
      };
    });
  }

  public async size(): Promise<number> {
    return (await this.list()).length;
  }

  /** Bounded queue: the oldest entries go first when the cap is reached. */
  private async trim(): Promise<void> {
    const items = await this.list();
    for (const item of items.slice(0, Math.max(0, items.length - this.maxItems))) {
      await this.remove(item.id);
    }
  }
}
