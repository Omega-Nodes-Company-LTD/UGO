import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import type { AuditLogger } from "../services/auditLog.js";
import type { Mailer } from "../services/auth/mailer.js";
import { RateLimiter } from "../services/auth/rateLimit.js";
import { pepperFrom } from "../services/auth/secrets.js";
import { registerAccessRoutes } from "./access.js";
import { registerDeviceRoutes } from "./devices.js";
import type { PreHandler } from "./guard.js";
import { registerSite } from "./site/index.js";
import type { LegalInfo } from "./site/legal.js";

/**
 * ADR-121, ADR-124: soul davanti a internet (`UGO_PUBLIC=on`). Assente =
 * soul in casa, com'è sempre stato: nessun sito, nessun accesso via email,
 * la radice è del muso.
 */
export interface PublicOptions {
  /** dove vive il sito: l'origine dei link e del controllo CSRF */
  publicUrl: string;
  /** per gli hash delle email e dei codici, e per far nascere le case */
  masterKey: Buffer;
  mailer: Mailer;
  legal: LegalInfo;
  /** ADR-125: annulla l'abbonamento presso il PSP prima della chiusura */
  cancelBilling?: (accountId: string) => Promise<void>;
}

/** ADR-121, ADR-124: il sito, l'accesso via email, il chiosco, la chiusura. */
export function registerPublicSurface(
  app: FastifyInstance,
  db: DbClient,
  options: PublicOptions,
  guard: PreHandler,
  audit: AuditLogger,
): void {
  const limiter = new RateLimiter(db, pepperFrom(options.masterKey, "rate"));
  registerSite(app, options.legal);
  registerAccessRoutes(app, {
    db,
    guard,
    audit,
    limiter,
    links: {
      masterKey: options.masterKey,
      emailPepper: pepperFrom(options.masterKey, "email"),
      mailer: options.mailer,
      publicUrl: options.publicUrl,
      termsVersion: options.legal.termsVersion,
    },
  });
  registerDeviceRoutes(app, {
    db,
    guard,
    audit,
    limiter,
    masterKey: options.masterKey,
    pairPepper: pepperFrom(options.masterKey, "pair"),
    ...(options.cancelBilling !== undefined && { cancelBilling: options.cancelBilling }),
  });
}
