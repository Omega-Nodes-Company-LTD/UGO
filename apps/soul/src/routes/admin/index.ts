import type { FastifyInstance } from "fastify";
import { ADMIN_PAGE } from "./page.js";
import { ADMIN_SCRIPT } from "./script.js";

/**
 * The operator panel (PROGETTO §7): registering the pack and teaching UGO a
 * voice must not require a terminal. The page itself is public-by-necessity —
 * it is only markup — but every action it performs goes through the same
 * bearer guard as the routes, with the token typed by the operator.
 */
export function registerAdminRoutes(app: FastifyInstance): void {
  app.get("/admin", async (_request, reply) => reply.type("text/html; charset=utf-8").send(ADMIN_PAGE));
  app.get("/admin/panel.js", async (_request, reply) =>
    reply.type("text/javascript; charset=utf-8").send(ADMIN_SCRIPT),
  );
}
