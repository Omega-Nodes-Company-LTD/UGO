import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Soul davanti a internet (ADR-121): tre regole, in un posto solo.
 *
 * 1. **Chi non si è presentato non parla con l'API.** Fino a ieri le rotte
 *    della conversazione erano aperte per disegno (ADR-007: il chiosco in
 *    salotto non aveva un token) e la casa unica era il ripiego di chi non
 *    diceva niente. In pubblico «nessuno» è nessuno: ogni `/v1/*` vuole un
 *    contesto, tranne una lista corta e scritta qui sotto. Le pagine (sito,
 *    muso, pannello, font) restano aperte: sono codice, i dati passano
 *    dall'API.
 * 2. **CSRF**: una scrittura autenticata da cookie deve venire dalle nostre
 *    pagine, cioè portare un `Origin` uguale a `PUBLIC_URL`. Un bearer va
 *    attaccato apposta e non ha bisogno di questa prova (ADR-124 §6).
 * 3. **Gli header** che dicono al browser di non fidarsi di nessun altro.
 */

interface OpenRoute {
  method?: string;
  path: string | RegExp;
}

/** Le sole porte dell'API aperte a chi non si è presentato. */
const OPEN_API: readonly OpenRoute[] = [
  { method: "GET", path: "/v1/version" },
  { method: "POST", path: "/v1/auth/link" },
  { method: "POST", path: "/v1/auth/esci" },
  // sei cifre e un rate limit: è la porta da cui il chiosco riceve il token
  { method: "POST", path: "/v1/dispositivi/abbina" },
  // il muso chiede se è abbinato prima di esserlo
  { method: "GET", path: "/v1/dispositivi/io" },
  // la vetrina si guarda senza account (ADR-126): è il negozio
  { method: "GET", path: /^\/v1\/vetrina(\/|$)/ },
  // la reception ha la sua chiave di servizio (ADR-051), controllata dalla rotta
  { path: /^\/v1\/reception\// },
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function pathOf(url: string): string {
  const at = url.indexOf("?");
  return at === -1 ? url : url.slice(0, at);
}

export function isOpenToAnonymous(method: string, url: string): boolean {
  const path = pathOf(url);
  if (!path.startsWith("/v1/") && !path.startsWith("/debug/")) return true;
  return OPEN_API.some(
    (route) =>
      (route.method === undefined || route.method === method) &&
      (typeof route.path === "string" ? route.path === path : route.path.test(path)),
  );
}

/** La CSP: niente script inline, niente terze parti, niente cornici. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // il wasm di MediaPipe (ADR-044) compila nel browser
  "script-src 'self' 'wasm-unsafe-eval'",
  // gli `style=` del pannello: classi un giorno, oggi inline (rischio dichiarato nel piano)
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

async function refuse(reply: FastifyReply, status: 401 | 403, title: string): Promise<void> {
  await reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status });
}

export interface PublicGateOptions {
  /** l'origine delle nostre pagine: `https://ugo.example` */
  publicUrl: string;
}

/** Va registrata DOPO `registerTenantResolution`: legge `request.tenant`. */
export function registerPublicGate(app: FastifyInstance, options: PublicGateOptions): void {
  const ours = new URL(options.publicUrl).origin;

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.tenant === null && !isOpenToAnonymous(request.method, request.url)) {
      request.log.info({ url: pathOf(request.url) }, "anonymous request on the public API");
      await refuse(reply, 401, "Unauthorized");
      return reply;
    }
    if (request.authVia === "cookie" && !SAFE_METHODS.has(request.method)) {
      if (request.headers.origin !== ours) {
        request.log.warn({ url: pathOf(request.url) }, "cookie write without our origin");
        await refuse(reply, 403, "Cross-site request refused");
        return reply;
      }
    }
    return undefined;
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    reply.header("content-security-policy", CONTENT_SECURITY_POLICY);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "same-origin");
    reply.header("x-frame-options", "DENY");
    reply.header("permissions-policy", "camera=(self), microphone=(self), geolocation=()");
    return payload;
  });
}
