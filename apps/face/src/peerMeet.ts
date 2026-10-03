import QRCode from "qrcode";

/**
 * L'incontro di persona, dal muso (ADR-020): il gosino mostra il suo biglietto
 * in QR, e inquadra quello dell'altro con la camera. Nessuna dipendenza
 * nuova: la lettura la fa `BarcodeDetector` del browser, dove c'è; dove non
 * c'è lo si dice, invece di fingere.
 *
 * Il biglietto porta il segreto di rotazione: si chiede a soul solo quando lo
 * si mostra, si ridisegna a ogni epoca (un biglietto vecchio è una
 * registrazione, non un incontro) e sparisce alla chiusura. In privacy niente
 * camera, niente biglietto.
 */

const REFRESH_MS = 60_000;
const SCAN_EVERY_MS = 400;
const SCAN_FOR_MS = 60_000;

export interface PeerCard {
  card: { name: string } & Record<string, unknown>;
  signature: string;
}

/** Un QR letto è un biglietto di gosino solo se ne ha la forma; il resto lo giudica soul. */
export function parsePeerCard(raw: string): PeerCard | undefined {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null) return undefined;
    const { card, signature } = value as { card?: unknown; signature?: unknown };
    if (typeof signature !== "string" || typeof card !== "object" || card === null) return undefined;
    if (typeof (card as { name?: unknown }).name !== "string") return undefined;
    return { card: card as PeerCard["card"], signature };
  } catch {
    return undefined;
  }
}

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** Il browser sa leggere un QR da sé? */
export function qrReader(scope: unknown = globalThis): DetectorCtor | undefined {
  const ctor = (scope as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof ctor === "function" ? (ctor as DetectorCtor) : undefined;
}

export interface PeerMeetElements {
  overlay: HTMLElement;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  status: HTMLElement;
}

export interface PeerMeetDeps {
  soulHttp: string;
  token: string | undefined;
  /** quale gosino si presenta: quello della stanza, dal roster */
  gosinoId: () => string | undefined;
  privacy: () => boolean;
}

export class PeerMeet {
  private refresh: ReturnType<typeof setInterval> | undefined;
  private stream: MediaStream | undefined;
  /** fino a quando si inquadra: zero = non si inquadra (la chiusura lo azzera) */
  private scanUntil = 0;

  public constructor(
    private readonly elements: PeerMeetElements,
    private readonly deps: PeerMeetDeps,
  ) {}

  private headers(json: boolean): Record<string, string> {
    return {
      ...(json && { "content-type": "application/json" }),
      ...(this.deps.token !== undefined && this.deps.token !== "" && { authorization: `Bearer ${this.deps.token}` }),
    };
  }

  private say(text: string): void {
    this.elements.status.textContent = text;
  }

  private async drawCard(gosino: string): Promise<boolean> {
    const res = await fetch(`${this.deps.soulHttp}/v1/gosini/${gosino}/biglietto`, { headers: this.headers(false) });
    if (res.status === 409) {
      this.say("Gli incontri di persona sono spenti: si accendono dal pannello, in «La piazza».");
      return false;
    }
    if (!res.ok) {
      this.say("Non riesco a prendere il biglietto. Riprova fra poco.");
      return false;
    }
    await QRCode.toCanvas(this.elements.canvas, JSON.stringify(await res.json()), { width: 280, margin: 2 });
    return true;
  }

  /** Mostra il proprio biglietto, rinnovato a ogni epoca finché resta aperto. */
  public async show(): Promise<void> {
    const gosino = this.deps.gosinoId();
    if (gosino === undefined || this.deps.privacy()) return;
    this.elements.overlay.hidden = false;
    this.say("Fai inquadrare questo all'altro gosino.");
    if (!(await this.drawCard(gosino))) return;
    clearInterval(this.refresh);
    this.refresh = setInterval(() => {
      void this.drawCard(gosino);
    }, REFRESH_MS);
  }

  /** Inquadra il biglietto dell'altro e lo presenta a soul. */
  public async scan(): Promise<void> {
    const gosino = this.deps.gosinoId();
    const Reader = qrReader();
    if (gosino === undefined || this.deps.privacy() || this.scanUntil > Date.now()) return;
    if (Reader === undefined) {
      this.say("Questo browser non sa leggere i QR: usa l'app UGO o un Chrome recente.");
      return;
    }
    this.scanUntil = Date.now() + SCAN_FOR_MS;
    this.say("Inquadra il QR dell'altro gosino.");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      this.elements.video.srcObject = this.stream;
      this.elements.video.hidden = false;
      await this.elements.video.play();
      const reader = new Reader({ formats: ["qr_code"] });
      while (Date.now() < this.scanUntil) {
        const found = (await reader.detect(this.elements.video)).map((c) => parsePeerCard(c.rawValue)).find(Boolean);
        if (found !== undefined) {
          await this.present(gosino, found);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, SCAN_EVERY_MS));
      }
      if (this.scanUntil !== 0) this.say("Non ho visto nessun biglietto. Riprova più vicino.");
    } catch {
      this.say("La camera non si è accesa.");
    } finally {
      this.stopCamera();
    }
  }

  private async present(gosino: string, card: PeerCard): Promise<void> {
    const res = await fetch(`${this.deps.soulHttp}/v1/gosini/${gosino}/presentazione`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(card),
    });
    if (res.status === 201) this.say(`Piacere, ${card.card.name}! Adesso vi riconoscete.`);
    else if (res.status === 422) this.say("Quel biglietto è scaduto: fatevene mostrare uno nuovo.");
    else this.say("La presentazione non è andata. Riprova.");
  }

  private stopCamera(): void {
    this.scanUntil = 0;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
    this.elements.video.hidden = true;
    this.elements.video.srcObject = null;
  }

  public close(): void {
    clearInterval(this.refresh);
    this.stopCamera();
    const context = this.elements.canvas.getContext("2d");
    context?.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
    this.elements.overlay.hidden = true;
  }
}
