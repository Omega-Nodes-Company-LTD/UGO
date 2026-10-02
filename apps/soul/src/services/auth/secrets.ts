import { createHash, createHmac, hkdfSync, randomBytes, randomInt } from "node:crypto";

/**
 * I mattoni dell'accesso (ADR-124): niente di qui finisce in chiaro in un
 * database o in un log.
 */

/** Un segreto da portare in un cookie o in un link: 32 byte, base64url. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Sei cifre per abbinare un chiosco: da leggere ad alta voce, una volta sola. */
export function newPairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Come si conserva un segreto: SHA-256 esadecimale, come per i token (ADR-019). */
export function digest(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Il pepe per gli hash delle email e delle chiavi di rate limit: derivato
 * dalla chiave madre, non un'altra variabile da dimenticare di ruotare.
 */
export function pepperFrom(masterKey: Buffer, purpose: "email" | "rate" | "pair"): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), `ugo-${purpose}-pepper`, 32));
}

/** HMAC: un'email (o un IP) diventa una chiave di ricerca che non si inverte. */
export function keyed(pepper: Buffer, value: string): string {
  return createHmac("sha256", pepper).update(value).digest("hex");
}
