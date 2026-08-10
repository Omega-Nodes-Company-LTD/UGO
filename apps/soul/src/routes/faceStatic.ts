import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * Serve the built face from soul itself (ADR-018, Tempo 1).
 *
 * One origin buys three things that two origins cannot: a single TLS
 * certificate, therefore a secure context — without which the phone denies
 * microphone and screen wake lock — and a `wss://` socket the page is allowed
 * to open. In development this is inert: Vite serves the face, the directory
 * does not exist, and the route is not registered at all.
 */
export function registerFaceStatic(app: FastifyInstance, root: string): void {
  if (!existsSync(root)) {
    app.log.info({ root }, "face bundle absent: soul serves the API only");
    return;
  }
  app.register(fastifyStatic, { root, wildcard: false, index: ["index.html"] });
}
