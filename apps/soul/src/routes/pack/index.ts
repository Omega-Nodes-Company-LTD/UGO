import { PRIME_GOSINO_ID } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { BeingsService } from "../../services/beingsService.js";
import { registerBeingRoutes } from "./beings.js";
import { registerSocialRoutes } from "./social.js";
import type { PackRouteDeps } from "./shared.js";

export type { PackRouteDeps } from "./shared.js";

/**
 * The pack over HTTP (ADR-014/016). Everything that mutates is guarded:
 * adding a being, amending consent or teaching a voice are not things a stray
 * request should do.
 */
export function registerPackRoutes(app: FastifyInstance, deps: PackRouteDeps): void {
  const service = new BeingsService(deps.db, deps.gosinoId ?? PRIME_GOSINO_ID);
  registerBeingRoutes(app, deps, service);
  registerSocialRoutes(app, deps, service);
}
