import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { faceRedirect, isKioskQuery } from "../faceStatic.js";
import { privacyPage, termsPage, type LegalInfo } from "./legal.js";
import { kennelPage, landingPage, loginPage, pupPage, shopPage, signupPage } from "./pages.js";
import { SITE_JS } from "./script.js";

/**
 * Il sito pubblico (ADR-121): la radice, l'iscrizione, la vetrina, le regole.
 * Registrato solo quando soul è pubblico — in casa la radice resta del muso.
 */

const html = "text/html; charset=utf-8";

export function registerSite(app: FastifyInstance, legal: LegalInfo): void {
  // le pagine statiche si compongono una volta: non cambiano sotto un processo vivo
  const landing = landingPage();
  const signup = signupPage();
  const shop = shopPage();
  const privacy = privacyPage(legal);
  const terms = termsPage(legal);

  app.get("/", async (request, reply) => {
    // un muso abbinato prima di ADR-121 bussa alla radice coi suoi parametri
    const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?") + 1) : "";
    if (isKioskQuery(query)) return reply.redirect(faceRedirect(request.url), 302);
    return reply.type(html).send(landing);
  });
  app.get("/registrati", async (_request, reply) => reply.type(html).send(signup));
  app.get("/accedi", async (request, reply) => {
    const expired = (request.query as { link?: string }).link === "scaduto";
    return reply.type(html).send(loginPage(expired));
  });
  app.get("/vetrina", async (_request, reply) => reply.type(html).send(shop));
  app.get("/vetrina/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(404).type(html).send(shop);
    return reply.type(html).send(pupPage(id));
  });
  app.get("/allevamenti/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return reply.code(404).type(html).send(shop);
    return reply.type(html).send(kennelPage(slug));
  });
  app.get("/privacy", async (_request, reply) => reply.type(html).send(privacy));
  app.get("/termini", async (_request, reply) => reply.type(html).send(terms));
  app.get("/sito/app.js", async (_request, reply) =>
    reply.type("text/javascript; charset=utf-8").header("cache-control", "no-cache").send(SITE_JS),
  );
}
