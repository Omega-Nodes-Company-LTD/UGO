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
 *
 * ADR-019 phase 2: the service is built per request, around the house the
 * caller speaks for. Built once at startup — as it was — it carried
 * `PRIME_GOSINO_ID` for everybody, so every house wrote into the first one.
 */
export function registerPackRoutes(app: FastifyInstance, deps: PackRouteDeps): void {
  const serviceFor = (accountId: string): BeingsService =>
    new BeingsService(deps.db, accountId);
  registerBeingRoutes(app, deps, serviceFor);
  registerSocialRoutes(app, deps, serviceFor);
}
