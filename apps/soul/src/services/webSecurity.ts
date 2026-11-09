/**
 * Le regole pure della casa sul web (ADR-127): quali rotte aprono senza
 * chiave, da quali origini si accetta una pagina, che intestazioni porta ogni
 * risposta, e il contatore di chi bussa troppo. Funzioni pure, unit test.
 */

/** Le sole porte senza chiave: tutto il resto di `/v1/*` vuole un token. */
const OPEN_EXACT = new Set(["/v1/pair", "/v1/login/email", "/v1/login/redeem", "/v1/version", "/v1/vetrina"]);
/**
 * Prefissi che si difendono da soli: la reception col suo segreto (ADR-051),
 * il telefono col suo (C4), la vetrina che è pubblica per costruzione (ADR-097).
 */
const OPEN_PREFIXES = ["/v1/reception/", "/v1/phone/", "/v1/vetrina/"];

export function needsToken(path: string): boolean {
  const bare = path.split("?")[0] ?? path;
  if (!bare.startsWith("/v1/") && bare !== "/v1") return false;
  if (OPEN_EXACT.has(bare)) return false;
  return !OPEN_PREFIXES.some((prefix) => bare.startsWith(prefix));
}

/** Le origini da cui una pagina può leggere le risposte di soul. */
export function allowedOrigins(publicUrl: string | undefined, extra: readonly string[]): string[] {
  const origins = new Set<string>(extra);
  if (publicUrl !== undefined) origins.add(new URL(publicUrl).origin);
  // la shell iOS/Android (Capacitor) carica il muso da qui
  origins.add("capacitor://localhost");
  origins.add("https://localhost");
  return [...origins];
}

/**
 * La CSP del muso e del pannello: tutto dalla stessa origine. `wasm-unsafe-eval`
 * per MediaPipe (il wasm è nostro, vendorizzato); stili inline perché il muso e
 * il pannello li portano nell'HTML; i socket verso la stessa casa.
 */
export function contentSecurityPolicy(publicUrl: string | undefined): string {
  const socket = publicUrl === undefined ? "" : ` ${new URL(publicUrl).origin.replace(/^http/u, "ws")}`;
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${socket}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function securityHeaders(publicUrl: string | undefined): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=(), payment=()",
    "content-security-policy": contentSecurityPolicy(publicUrl),
    // HSTS solo quando la casa è davvero su HTTPS pubblico: in rete locale
    // un HSTS su un IP sarebbe una trappola
    ...(publicUrl?.startsWith("https://") === true && {
      "strict-transport-security": "max-age=31536000; includeSubDomains",
    }),
  };
}

/** Il token del socket arriva in query (un browser non può mettere header su un WS): mai nel log. */
export function redactToken(url: string): string {
  return url.replace(/([?&]token=)[^&]*/gu, "$1[redacted]");
}

/** Cinque tentativi al minuto per IP sulle porte aperte: chi indovina codici si stanca prima. */
export class AttemptLimiter {
  private readonly seen = new Map<string, number[]>();

  public constructor(
    private readonly max = 5,
    private readonly windowMs = 60_000,
  ) {}

  public allow(key: string, now: number = Date.now()): boolean {
    const recent = (this.seen.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.seen.set(key, recent);
      return false;
    }
    recent.push(now);
    this.seen.set(key, recent);
    if (this.seen.size > 10_000) this.seen.clear();
    return true;
  }
}

/** Il cookie di sessione del web: mai leggibile da script, mai su HTTP, mai da un altro sito. */
export const SESSION_COOKIE = "ugo_session";

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${String(maxAgeSeconds)}`;
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** apple-app-site-association: i link `/pair/*` e `/login/*` aprono l'app (C1). */
export function appleAppSiteAssociation(appIds: readonly string[]): unknown {
  return {
    applinks: {
      details: [{ appIDs: [...appIds], components: [{ "/": "/pair/*" }, { "/": "/login/*" }] }],
    },
  };
}
