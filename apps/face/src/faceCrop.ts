import type { Located } from "./gaze.js";

/**
 * Il ritaglio del volto, nella misura esatta che l'encoder vuole (ADR-052).
 *
 * `decode_face` in `ops/voice/app.py` accetta **RGB uint8 112×112 in base64** e
 * niente altro: rifiuta qualunque cosa non sia esattamente 112·112·3 byte. È un
 * contratto rigido di proposito — un JPEG o un PNG vorrebbe dire decodificare
 * un formato d'immagine dentro il servizio, cioè far entrare una superficie
 * d'attacco per risparmiare venti righe qui.
 *
 * Il ritaglio lo fa il corpo perché **il corpo ha la camera**: il video non
 * esce mai dal telefono, e quel che parte è un rettangolo di 37 KB già ridotto
 * al volto.
 */

/** Il lato che ArcFace vuole. Fisso: fa parte del contratto, non è una scelta. */
export const CROP_SIDE = 112;

/**
 * Quanto si allarga il rettangolo del rilevatore prima di ritagliare.
 *
 * BlazeFace restituisce la faccia stretta — occhi, naso, bocca — e gli encoder
 * di riconoscimento sono allenati su ritagli che comprendono mento, fronte e un
 * po' di capelli. Ritagliare esattamente il rettangolo del rilevatore darebbe
 * un'immagine sistematicamente diversa da quelle su cui il modello è stato
 * misurato, e il risultato non sarebbe un errore: sarebbe una confidenza più
 * bassa e inspiegabile.
 */
const PADDING = 1.35;

/**
 * Estrae il volto da un fotogramma, o `undefined` se non c'è un rettangolo.
 *
 * `undefined` e non un ritaglio vuoto: un locator che non dà la bounding box —
 * il `FaceDetector` nativo su un browser che non la riempie — deve far saltare
 * il riconoscimento, non spedire un quadrato di pixel a caso che il servizio
 * accetterebbe volentieri e su cui costruirebbe un'impronta.
 */
export function cropFace(video: HTMLVideoElement, at: Located): string | undefined {
  const { width, height } = at;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return undefined;
  if (video.videoWidth === 0 || video.videoHeight === 0) return undefined;

  // il lato più lungo governa: un ritaglio non quadrato, riscalato a 112×112,
  // schiaccerebbe la faccia lungo un asse — e uno schiacciamento sistematico è
  // una faccia diversa per l'encoder
  const side = Math.max(width * video.videoWidth, height * video.videoHeight) * PADDING;
  const cx = at.x * video.videoWidth;
  const cy = at.y * video.videoHeight;

  const canvas = document.createElement("canvas");
  canvas.width = CROP_SIDE;
  canvas.height = CROP_SIDE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return undefined;
  ctx.drawImage(video, cx - side / 2, cy - side / 2, side, side, 0, 0, CROP_SIDE, CROP_SIDE);

  const { data } = ctx.getImageData(0, 0, CROP_SIDE, CROP_SIDE);
  // RGBA → RGB: il canale alfa è sempre 255 su un fotogramma video, e mandarlo
  // sarebbe un quarto di banda in più per un byte costante
  const rgb = new Uint8Array(CROP_SIDE * CROP_SIDE * 3);
  for (let pixel = 0; pixel < CROP_SIDE * CROP_SIDE; pixel += 1) {
    rgb[pixel * 3] = data[pixel * 4] ?? 0;
    rgb[pixel * 3 + 1] = data[pixel * 4 + 1] ?? 0;
    rgb[pixel * 3 + 2] = data[pixel * 4 + 2] ?? 0;
  }
  return base64Of(rgb);
}

/**
 * Uint8Array → base64, senza `btoa(String.fromCharCode(...bytes))`.
 *
 * Quello spread mette 37 632 argomenti sullo stack in una chiamata sola, e su
 * un telefono è precisamente il modo in cui una funzione innocua diventa un
 * `RangeError` che si vede solo sul dispositivo del proprietario.
 */
function base64Of(bytes: Uint8Array): string {
  let text = "";
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(text);
}
