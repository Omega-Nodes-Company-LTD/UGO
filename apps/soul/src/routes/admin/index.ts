import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ADMIN_PAGE } from "./page.js";
import { ADMIN_SCRIPT } from "./script.js";

/**
 * Quale pannello sto guardando.
 *
 * Stessa idea della versione del muso (`servedBuildId` in `faceStatic.ts`): un
 * hash del CONTENUTO servito, che cambia esattamente quando il contenuto
 * cambia e non un minuto prima. Non una versione dichiarata a mano, che si
 * dimentica di essere aggiornata proprio nei giorni in cui servirebbe.
 *
 * Esiste per una ragione precisa, costata mezza mattina: il proprietario
 * guardava un pannello e io descrivevo funzioni che erano in `main` ma non
 * ancora ridistribuite. Nessuno dei due poteva accorgersene, perché il
 * pannello non diceva di che epoca fosse. Adesso lo dice.
 */
const PANEL_VERSION = createHash("sha256")
  .update(ADMIN_PAGE)
  .update(ADMIN_SCRIPT)
  .digest("base64url")
  .slice(0, 8);

/**
 * The operator panel (PROGETTO §7): registering the pack and teaching UGO a
 * voice must not require a terminal. The page itself is public-by-necessity —
 * it is only markup — but every action it performs goes through the same
 * bearer guard as the routes, with the token typed by the operator.
 */
export function registerAdminRoutes(app: FastifyInstance): void {
  app.get("/admin", async (_request, reply) =>
    reply
      .type("text/html; charset=utf-8")
      // sostituito qui e non dentro la pagina: `ADMIN_PAGE` è una costante, e
      // l'hash si calcola su di lei — infilarcelo dentro prima sarebbe un
      // hash di se stesso
      .send(ADMIN_PAGE.replace("__PANEL_VERSION__", PANEL_VERSION)),
  );
  app.get("/admin/panel.js", async (_request, reply) =>
    reply.type("text/javascript; charset=utf-8").send(ADMIN_SCRIPT),
  );
}
