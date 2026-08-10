/**
 * Keeps the screen on while UGO is in the dock (PROGETTO §4.1).
 *
 * A creature that goes dark after thirty seconds is a screensaver. The Screen
 * Wake Lock API is the one piece of this that a web page *can* do — the
 * limits that need a real app (recording with the screen off, the wake word)
 * are catalogued in ADR-018.
 *
 * The lock is released by the system whenever the tab is hidden, so it has to
 * be re-taken on the way back: without that, one glance at another app and
 * UGO sleeps for good.
 */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

interface WakeLockCapableNavigator {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

/**
 * The slice of `document` this needs. Narrower than `Pick<Document, …>`, whose
 * overloaded `addEventListener` no test double can satisfy.
 */
export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
}

export class ScreenAwake {
  private sentinel: WakeLockSentinelLike | undefined;

  public constructor(private readonly nav: WakeLockCapableNavigator = navigator) {}

  public available(): boolean {
    return this.nav.wakeLock !== undefined;
  }

  public held(): boolean {
    return this.sentinel !== undefined;
  }

  /** Best effort by design: on a browser without the API the face still runs. */
  public async acquire(): Promise<boolean> {
    if (this.nav.wakeLock === undefined || this.sentinel !== undefined) return false;
    try {
      const sentinel = await this.nav.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        this.sentinel = undefined;
      });
      this.sentinel = sentinel;
      return true;
    } catch {
      // denied, or the device is on low battery: not a failure worth a dialog
      return false;
    }
  }

  public async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    if (sentinel !== undefined) await sentinel.release();
  }

  /** Re-take the lock when the tab comes back, since the system drops it. */
  public watch(doc: VisibilitySource): void {
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "visible") void this.acquire();
    });
  }
}
