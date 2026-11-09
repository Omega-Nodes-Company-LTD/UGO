import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Le parti pure del telefono (ADR-128): chi è il cliente, chi è la chiamata,
 * e l'URL dell'audio che Twilio deve poter scaricare senza un'intestazione.
 */

/** Twilio fa `<Play>` di un URL nudo: la firma sta nella query, e scade. */
export const AUDIO_TTL_MS = 10 * 60_000;

const AUDIO_KEY_LABEL = "ugo-phone-audio-v1";
const CONTACT_KEY_LABEL = "ugo-contact-email-v1";

/**
 * La chiave che firma gli URL dell'audio, DERIVATA da `UGO_PHONE_TOKEN` e non
 * il token stesso: un URL finito in un log di Twilio non deve servire a
 * niente oltre i suoi dieci minuti, e ruotare il token invalida anche gli URL.
 */
export function audioSigningKey(phoneToken: string): Buffer {
  return createHmac("sha256", phoneToken).update(AUDIO_KEY_LABEL).digest();
}

export function signAudio(key: Buffer, id: string, expiresAtMs: number): string {
  return createHmac("sha256", key).update(`${id}.${String(expiresAtMs)}`).digest("hex");
}

export function audioPath(key: Buffer, id: string, expiresAtMs: number): string {
  const sig = signAudio(key, id, expiresAtMs);
  return `/v1/phone/audio/${encodeURIComponent(id)}?exp=${String(expiresAtMs)}&sig=${sig}`;
}

export type AudioVerdict = "ok" | "expired" | "invalid";

export function verifyAudio(
  key: Buffer,
  id: string,
  exp: string | undefined,
  sig: string | undefined,
  nowMs: number,
): AudioVerdict {
  if (exp === undefined || sig === undefined || !/^\d{1,16}$/u.test(exp) || !/^[0-9a-f]{64}$/u.test(sig)) {
    return "invalid";
  }
  const expected = Buffer.from(signAudio(key, id, Number(exp)), "hex");
  const given = Buffer.from(sig, "hex");
  if (!timingSafeEqual(expected, given)) return "invalid";
  // la firma prima della scadenza: un'ora alterata deve dire «non tua», non «scaduta»
  return Number(exp) < nowMs ? "expired" : "ok";
}

/** Il CallSid non si conserva: basta un'impronta per sommare i turni (ADR-128). */
export function callRefOf(callId: string): string {
  return createHash("sha256").update(callId, "utf8").digest("hex");
}

/**
 * Come si riconosce un cliente al telefono senza tenere la sua email: un HMAC
 * dell'indirizzo normalizzato, con una chiave derivata da `UGO_DATA_KEY` —
 * che non sta nel database, quindi un dump non si rovescia con un dizionario.
 */
export function contactEmailHash(dataKey: Buffer, email: string): string {
  const key = createHmac("sha256", dataKey).update(CONTACT_KEY_LABEL).digest();
  return createHmac("sha256", key).update(email.trim().toLowerCase()).digest("hex");
}

/** Il segno con cui il modello dice «questa non è roba mia» (ADR-128). */
export const HANDOVER_MARKER = "[PASSA]";

export function readHandover(raw: string): { text: string; handover: boolean } {
  const text = raw.trim();
  if (text === "") return { text, handover: true };
  if (!text.includes(HANDOVER_MARKER)) return { text, handover: false };
  return { text: text.replaceAll(HANDOVER_MARKER, "").trim(), handover: true };
}

export function handoverPhrase(language: "it" | "en"): string {
  return language === "en"
    ? "I'd rather pass you to a person from the studio: please hold on a moment."
    : "Su questo preferisco passarti a una persona dello studio: resta in linea un momento.";
}

/** Il segreto di servizio, confrontato a tempo costante. */
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
