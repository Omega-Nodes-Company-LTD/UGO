import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * Quale muso sto servendo (`GET /v1/version`).
 *
 * Non una variabile d'ambiente e non un numero da incrementare: il nome del
 * bundle che vite ha prodotto, che è un hash del contenuto. Cambia esattamente
 * quando cambia il codice, e il deploy non deve ricordarsi di niente.
 *
 * Esiste per una ragione precisa: davanti a un muso che non rispondeva non
 * c'era modo di sapere se il dispositivo stesse eseguendo il codice appena
 * rilasciato o quello vecchio ancora in cache, e ogni ipotesi costava un giro
 * di deploy per essere smentita. Il corpo confronta questo con il proprio e si
 * ricarica da solo.
 */
export function servedBuildId(root: string): string {
  try {
    const assets = readdirSync(join(root, "assets"));
    const main = assets.find((name) => /^index-[A-Za-z0-9_-]+\.js$/.test(name));
    return /^index-([A-Za-z0-9_-]+)\.js$/.exec(main ?? "")?.[1] ?? "dev";
  } catch {
    // nessuna cartella `assets`: sviluppo, dove il muso lo serve vite
    return "dev";
  }
}

/**
 * Serve the built face from soul itself (ADR-018, Tempo 1).
 *
 * One origin buys three things that two origins cannot: a single TLS
 * certificate, therefore a secure context — without which the phone denies
 * microphone and screen wake lock — and a `wss://` socket the page is allowed
 * to open. Since ADR-121 it lives under `/muso/`: the root belongs to the
 * public site, and a device paired before the move is redirected there. In development this is inert: Vite serves the face, the directory
 * does not exist, and the route is not registered at all.
 */
/** ADR-121: dove vive il muso. La radice è del sito pubblico. */
export const FACE_PREFIX = "/muso/";

/** I parametri che dicono «sono un muso»: chi li porta su `/` va a `/muso/`. */
const KIOSK_PARAMS = ["soul", "gosino", "stanza", "token", "mode", "contact", "ears"];

export function isKioskQuery(query: string): boolean {
  const params = new URLSearchParams(query);
  return KIOSK_PARAMS.some((key) => params.has(key));
}

/** `/?gosino=x` di un dispositivo abbinato prima di ADR-121 → `/muso/?gosino=x`. */
export function faceRedirect(url: string): string {
  const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return `${FACE_PREFIX}${query}`;
}

export interface FaceStaticOptions {
  /**
   * La radice manda al muso: vero quando non c'è un sito che la occupi
   * (soul in casa, `UGO_PUBLIC=off`), così i dispositivi di prima non si
   * accorgono del trasloco.
   */
  rootIsFace: boolean;
}

export function registerFaceStatic(app: FastifyInstance, root: string, options: FaceStaticOptions): void {
  if (!existsSync(root)) {
    app.log.info({ root }, "face bundle absent: soul serves the API only");
    return;
  }
  // letto una volta all'avvio: il contenuto della cartella non cambia sotto un
  // processo vivo, e una `readdir` per richiesta sarebbe I/O per niente
  const version = servedBuildId(root);
  app.log.info({ version }, "serving the face bundle");
  // aperta di proposito: la versione non è un segreto, e un corpo che deve
  // sapere se è aggiornato non ha ancora nessun token in mano
  app.get("/v1/version", () => ({ version }));
  if (options.rootIsFace) {
    app.get("/", async (request, reply) => reply.redirect(faceRedirect(request.url), 302));
  }
  app.register(fastifyStatic, {
    root,
    prefix: FACE_PREFIX,
    // `/muso` senza barra: i percorsi relativi del bundle vogliono la barra
    redirect: true,
    wildcard: false,
    index: ["index.html"],
    /**
     * Il muso è una PWA servita dal kiosk: la `index.html` DEVE arrivare
     * sempre fresca (il corpo la confronta con `/v1/version` e si ricarica),
     * mentre i bundle hashati in `/assets/*` sono immutabili per costruzione
     * — ri-servirli da cache è un guadagno, mai un problema. Senza questo,
     * una proxy o una cache del provider poteva tenere la `index.html`
     * vecchia e il check version ricaricava sempre la stessa build.
     */
    setHeaders(response, path) {
      if (path.endsWith("/index.html")) {
        response.header("cache-control", "no-cache, no-store, must-revalidate");
      } else if (path.includes("/assets/")) {
        response.header("cache-control", "public, max-age=31536000, immutable");
      }
    },
  });
}
