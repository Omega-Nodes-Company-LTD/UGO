/**
 * Il visore dell'album (ADR-109): le foto che la casa ha chiesto di rivedere,
 * sullo schermo del chiosco.
 *
 * Diviso in due apposta. `photoStripPlan` **decide** — cosa si vede, con che
 * testo alternativo, se il visore resta aperto — ed è puro, quindi si prova
 * con degli esempi. `createPhotoStrip` **disegna**, e non decide niente: è
 * quattro chiamate al DOM, e testarle vorrebbe dire portare in casa un DOM
 * finto (una dipendenza in più, SECURITY §2) per verificare `append`.
 *
 * Le immagini arrivano già in chiaro dal canale WS: il muso non ha un token
 * da spendere sull'API dell'album, e non deve averne uno.
 */

export interface ShownPhoto {
  id: string;
  caption: string;
  image: string;
}

export interface StripEntry {
  id: string;
  /** la sorgente pronta: `data:`, e non un blob da revocare */
  src: string;
  /** sempre presente: un'immagine senza alt è invisibile a chi non vede */
  alt: string;
  /** assente quando il modello non ha detto niente: niente righe vuote */
  caption?: string;
}

export interface StripPlan {
  open: boolean;
  entries: StripEntry[];
}

/** Quanto resta aperto se nessuno lo tocca: è un chiosco, non una cornice. */
export const STRIP_LINGER_MS = 45_000;

/** La decisione, senza un DOM intorno. */
export function photoStripPlan(photos: readonly ShownPhoto[]): StripPlan {
  const entries = photos.map((photo) => {
    const caption = photo.caption.trim();
    return {
      id: photo.id,
      src: `data:image/jpeg;base64,${photo.image}`,
      alt: caption === "" ? "uno scatto" : caption,
      ...(caption !== "" && { caption }),
    };
  });
  return { open: entries.length > 0, entries };
}

export interface PhotoStrip {
  show: (photos: readonly ShownPhoto[]) => void;
  close: () => void;
}

export function createPhotoStrip(
  root: HTMLElement,
  options: { lingerMs?: number } = {},
): PhotoStrip {
  const lingerMs = options.lingerMs ?? STRIP_LINGER_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    root.replaceChildren();
    root.hidden = true;
  };

  const show = (photos: readonly ShownPhoto[]): void => {
    const plan = photoStripPlan(photos);
    if (!plan.open) {
      close();
      return;
    }
    const strip = document.createElement("div");
    strip.className = "photo-strip";
    for (const entry of plan.entries) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = entry.src;
      img.alt = entry.alt;
      figure.append(img);
      if (entry.caption !== undefined) {
        const caption = document.createElement("figcaption");
        // `textContent` e mai `innerHTML`: la didascalia la scrive un modello,
        // e un modello scrive quello che gli capita
        caption.textContent = entry.caption;
        figure.append(caption);
      }
      strip.append(figure);
    }
    root.replaceChildren(strip);
    root.hidden = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(close, lingerMs);
  };

  root.addEventListener("click", close);
  return { show, close };
}
