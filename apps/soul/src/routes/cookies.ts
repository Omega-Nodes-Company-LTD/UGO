import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * I due cookie di soul (ADR-121, ADR-124), scritti a mano: due nomi e quattro
 * attributi non valgono una dipendenza in più da tenere aggiornata.
 *
 * Il prefisso `__Host-` è una promessa che il browser fa rispettare: niente
 * `Domain`, `Path=/`, `Secure`. Un sottodominio compromesso non può
 * sovrascriverli, e su `http://` in chiaro non esistono.
 */

/** la sessione del browser di chi ha fatto l'accesso */
export const SESSION_COOKIE = "__Host-ugo_sid";
/** il chiosco abbinato: porta un token `member`, mai leggibile dal JS */
export const DEVICE_COOKIE = "__Host-ugo_dev";

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    if (part.slice(0, at).trim() !== name) continue;
    const value = part.slice(at + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function append(reply: FastifyReply, cookie: string): void {
  const current = reply.getHeader("set-cookie");
  const list = current === undefined ? [] : Array.isArray(current) ? current : [String(current)];
  reply.header("set-cookie", [...list, cookie]);
}

export function setCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  options: { maxAgeSec: number; sameSite: "Lax" | "Strict" },
): void {
  append(
    reply,
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${String(options.maxAgeSec)}; ` +
      `HttpOnly; Secure; SameSite=${options.sameSite}`,
  );
}

export function clearCookie(reply: FastifyReply, name: string): void {
  append(reply, `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}
