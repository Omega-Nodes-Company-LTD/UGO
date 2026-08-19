import type { GlimpseBody } from "./sceneReader.js";
import type { AlbumService, KeepPhotoRefusal } from "./albumService.js";
import { KEEP_REFUSALS } from "./albumService.js";
import { windowFor, type ShowCommand } from "./volition/album.js";

/**
 * Il fotografo (ADR-109): il pezzo che sta fra il gesto di una persona, il
 * corpo che ha la camera, e l'album che conserva.
 *
 * Esiste per una ragione sola ma buona: `AlbumService` sa di archivio e non
 * deve sapere di corpi, `FaceGateway` sa di corpi e non deve sapere di
 * durate. Qui si incontrano, e qui sta l'ordine che conta — **i cancelli
 * prima dei pixel**: si guarda se la casa tiene le foto e se qualcuno ha
 * chiesto di non essere guardato PRIMA di dire al corpo di scattare. Una
 * foto rifiutata dopo essere stata scattata è una foto che è esistita.
 */

export type ShotOutcome =
  | { outcome: "no_body" }
  | { outcome: "no_camera" }
  | { outcome: "refused"; why: KeepPhotoRefusal }
  | { outcome: "kept"; caption: string; expiresAt: Date };

export type ShowOutcome =
  | { outcome: "no_body" }
  | { outcome: "album_off" }
  | { outcome: "none" }
  | { outcome: "shown"; count: number };

/** Quante se ne guardano in una volta: il tetto del contratto WS. */
export const SHOW_MAX_PHOTOS = 6;
/** Quanto si aspetta uno scatto: più di uno sguardo, ma non all'infinito. */
const SHOT_WAIT_MS = 8_000;
const SHOT_FRESH_MS = 20_000;

export interface PhotographerDeps {
  gateway: () => (GlimpseBody & {
    askPhoto: () => void;
    takePhoto: (maxAgeMs: number, at?: Date) => string | undefined;
    showPhotos: (shown: { id: string; caption: string; image: string }[]) => void;
  }) | undefined;
  album: AlbumService;
  accountId: string;
  gosinoId: string;
  /** la frase che diventa didascalia; assente = la foto resta senza parole */
  vision?: { describe: (imageBase64: string) => Promise<string | undefined> } | undefined;
  waitMs?: number | undefined;
  pollMs?: number | undefined;
}

export class Photographer {
  public constructor(private readonly deps: PhotographerDeps) {}

  /** Scatta e conserva. **L'unico punto che chiede una foto al corpo.** */
  public async shoot(at: Date = new Date()): Promise<ShotOutcome> {
    const body = this.deps.gateway();
    if (body?.hasBody() !== true) return { outcome: "no_body" };

    // i cancelli PRIMA dei pixel (regola 9): se la casa non tiene le foto o
    // qualcuno ha detto «non guardarmi», al corpo non si chiede niente
    const gate = await this.deps.album.gate(this.deps.accountId);
    if (gate.hours === 0) return { outcome: "refused", why: "album-spento" };
    if (gate.someoneRefuses) return { outcome: "refused", why: "qualcuno-non-vuole" };

    body.askPhoto();
    const image = await this.await_(body, at);
    if (image === undefined) return { outcome: "no_camera" };

    const caption = (await this.deps.vision?.describe(image))?.trim() ?? "";
    const kept = await this.deps.album.keep(this.deps.accountId, {
      gosinoId: this.deps.gosinoId,
      jpegBase64: image,
      caption,
      at,
    });
    if (typeof kept === "string") return { outcome: "refused", why: kept };
    return { outcome: "kept", caption: kept.caption, expiresAt: kept.expiresAt };
  }

  /** Le foto chieste, sullo schermo del chiosco. */
  public async show(command: ShowCommand, at: Date = new Date()): Promise<ShowOutcome> {
    const body = this.deps.gateway();
    if (body?.hasBody() !== true) return { outcome: "no_body" };
    const gate = await this.deps.album.gate(this.deps.accountId);
    if (gate.hours === 0) return { outcome: "album_off" };

    const window = windowFor(command.when, at);
    const found = await this.deps.album.search(
      this.deps.accountId,
      { words: command.words, since: window.since, until: window.until },
      Math.min(command.count, SHOW_MAX_PHOTOS),
    );
    if (found.length === 0) return { outcome: "none" };

    const shown: { id: string; caption: string; image: string }[] = [];
    for (const photo of found) {
      const image = await this.deps.album.open(this.deps.accountId, photo.id);
      // una che non si apre non ferma le altre: meglio tre foto che un errore
      if (image !== undefined) shown.push({ id: photo.id, caption: photo.caption, image });
    }
    if (shown.length === 0) return { outcome: "none" };
    body.showPhotos(shown);
    return { outcome: "shown", count: shown.length };
  }

  private async await_(body: GlimpseBody & { takePhoto: (ms: number, at?: Date) => string | undefined }, at: Date) {
    // stessa meccanica dello sguardo, su una casella diversa: si aspetta a
    // passi e si prende una volta sola
    const deadline = Date.now() + (this.deps.waitMs ?? SHOT_WAIT_MS);
    const pollMs = this.deps.pollMs ?? 250;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      const held = body.takePhoto(SHOT_FRESH_MS, at);
      if (held !== undefined) return held;
    }
    return undefined;
  }
}

/** Le risposte, in carattere. Gli esiti sono distinti e si dicono. */
export function replyForShot(shot: ShotOutcome): string {
  switch (shot.outcome) {
    case "no_body":
      return "Non ho un corpo con la camera in questa stanza, grunf.";
    case "no_camera":
      return "Ci ho provato, ma la camera è spenta o il corpo non mi risponde.";
    case "refused":
      return KEEP_REFUSALS[shot.why];
    case "kept":
      return shot.caption === ""
        ? "Fatto, scattata! La tengo finché non scade."
        : `Fatto, scattata! ${shot.caption}`;
  }
}

export function replyForShow(shown: ShowOutcome): string {
  switch (shown.outcome) {
    case "no_body":
      return "Non ho uno schermo qui su cui fartele vedere, grunf.";
    case "album_off":
      return "Questa casa non conserva foto: l'album è spento.";
    case "none":
      return "Non trovo scatti così. Forse sono già scaduti, grunf.";
    case "shown":
      return shown.count === 1 ? "Eccola!" : `Eccone ${String(shown.count)}!`;
  }
}
