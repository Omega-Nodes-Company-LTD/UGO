/**
 * Dove stanno i file del muso (ADR-121).
 *
 * Il muso non vive più alla radice: soul lo serve sotto `/muso/`, perché la
 * radice è del sito. Vite lo costruisce con `base: "./"`, e i pochi percorsi
 * scritti a mano — i modelli di MediaPipe — si risolvono contro il documento
 * invece di partire da `/`: lo stesso bundle funziona sotto `/muso/`, alla
 * radice di `vite preview` e dentro l'APK.
 */
export function visionAsset(file = ""): string {
  const url = new URL(`vision/${file}`, document.baseURI).href;
  return file === "" ? url.replace(/\/$/, "") : url;
}
