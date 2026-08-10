import QRCode from "qrcode";
import type { FaceToServerMessage } from "@ugo/shared/face";

/**
 * Portable mode (PROGETTO §4.2, ADR-011: visibile by design).
 * - REC indicator is unmistakable while recording (banner + document flag)
 * - privacy mode REALLY stops the microphone: recorder stopped AND every
 *   track ended — verified by e2e tests, not just a muted icon
 * - business-card overlay: QR + lead_contact event (curiosity → lead)
 * Uploads go through soul's presigned URLs; failed uploads stay queued
 * in memory and retry on the next attempt (store-and-forward, §4.1).
 */

const MAX_PENDING_UPLOADS = 20;

export interface PortableElements {
  recBanner: HTMLElement;
  privacyOverlay: HTMLElement;
  qrOverlay: HTMLElement;
  qrCanvas: HTMLCanvasElement;
}

export class PortableController {
  private recorder: MediaRecorder | undefined;
  private stream: MediaStream | undefined;
  private chunks: Blob[] = [];
  private pendingUploads: { filename: string; blob: Blob }[] = [];
  private privacy = false;

  public constructor(
    private readonly soulHttpBase: string,
    private readonly elements: PortableElements,
    private readonly sendEvent: (message: FaceToServerMessage) => void,
    private readonly contactUrl: string,
    /** operator token for soul's guarded routes (presign); absent in dev */
    private readonly internalToken?: string,
    /** lets the caller mirror the REC state on the Glyph LEDs (§4.2) */
    private readonly onRecording?: (recording: boolean) => void,
  ) {}

  private authHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.internalToken !== undefined && {
        authorization: `Bearer ${this.internalToken}`,
      }),
    };
  }

  public isPrivacyOn(): boolean {
    return this.privacy;
  }

  public recorderState(): string {
    return this.recorder?.state ?? "inactive";
  }

  public trackStates(): string[] {
    return this.stream?.getTracks().map((track) => track.readyState) ?? [];
  }

  public pendingCount(): number {
    return this.pendingUploads.length;
  }

  public async startRecording(): Promise<void> {
    if (this.privacy || this.recorder?.state === "recording") return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: "audio/webm;codecs=opus" });
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(1000);
    // REC ben visibile (§4.2): banner, flag e pattern Glyph dedicato
    this.elements.recBanner.hidden = false;
    document.documentElement.dataset.recording = "true";
    this.onRecording?.(true);
  }

  public async stopRecording(): Promise<void> {
    const recorder = this.recorder;
    if (recorder === undefined || recorder.state === "inactive") return;
    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => {
        resolve();
      });
      recorder.stop();
    });
    this.releaseMicrophone();
    const blob = new Blob(this.chunks, { type: "audio/webm" });
    this.chunks = [];
    if (blob.size > 0) {
      this.queueUpload({ filename: buildRecordingName(new Date()), blob });
    }
    await this.flushUploads();
  }

  private releaseMicrophone(): void {
    this.elements.recBanner.hidden = true;
    delete document.documentElement.dataset.recording;
    this.onRecording?.(false);
    for (const track of this.stream?.getTracks() ?? []) track.stop();
  }

  /** privacy a vista: occhi chiusi, mic e registrazione realmente OFF */
  public async setPrivacy(on: boolean): Promise<void> {
    this.privacy = on;
    document.documentElement.dataset.privacy = on ? "on" : "off";
    this.elements.privacyOverlay.hidden = !on;
    if (on) {
      const recorder = this.recorder;
      if (recorder !== undefined && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => {
            resolve();
          });
          recorder.stop();
        });
      }
      this.releaseMicrophone();
    }
  }

  private queueUpload(item: { filename: string; blob: Blob }): void {
    if (this.pendingUploads.length >= MAX_PENDING_UPLOADS) this.pendingUploads.shift();
    this.pendingUploads.push(item);
  }

  public async flushUploads(): Promise<void> {
    const still: { filename: string; blob: Blob }[] = [];
    for (const item of this.pendingUploads) {
      try {
        const presign = await fetch(`${this.soulHttpBase}/v1/audio/presign`, {
          method: "POST",
          headers: this.authHeaders(),
          body: JSON.stringify({ filename: item.filename }),
        });
        if (!presign.ok) throw new Error(`presign ${String(presign.status)}`);
        const { url } = (await presign.json()) as { url: string };
        const upload = await fetch(url, { method: "PUT", body: item.blob });
        if (!upload.ok) throw new Error(`upload ${String(upload.status)}`);
      } catch {
        still.push(item); // stays queued: retried on the next flush
      }
    }
    this.pendingUploads = still;
  }

  /** biglietto da visita parlante (§4.2): QR a schermo + evento lead_contact */
  public async showBusinessCard(): Promise<void> {
    await QRCode.toCanvas(this.elements.qrCanvas, this.contactUrl, { width: 240, margin: 2 });
    this.elements.qrOverlay.hidden = false;
    this.sendEvent({ type: "tap" }); // wake attention over WS
    try {
      // curiosity becomes a measurable lead on the events table
      await fetch(`${this.soulHttpBase}/v1/events`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({ source: "face", type: "lead_contact", payload: {} }),
      });
    } catch {
      // offline: the QR still shows; the lead event is best-effort
    }
  }

  public hideBusinessCard(): void {
    this.elements.qrOverlay.hidden = true;
  }
}

export function buildRecordingName(at: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const date = `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${date}_${pad(at.getHours())}${pad(at.getMinutes())}_giro.webm`;
}
