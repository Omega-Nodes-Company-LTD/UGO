import { withAccount, type DbClient } from "@ugo/db";
import type { Quota, Toggle } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import { needsPlan, type PlanGate } from "../services/billing/plan.js";
import { resolveAccount } from "./scope.js";

/**
 * Dove il piano conta (ADR-125), in un posto solo: una tabella e un hook.
 *
 * Spargere un controllo in sei rotte vuol dire che la settima — quella
 * aggiunta il mese prossimo — nasce senza. Qui una rotta che sblocca una
 * capacità si aggiunge alla tabella, e il test percorre la tabella.
 *
 * La voce non sta qui: senza voce nel piano `/v1/tts` risponde 204 e `/v1/stt`
 * 501, cioè «usa quella del browser», non 402 — il muso lo sa già fare.
 * L'album automatico (gli scatti) lo ferma `AlbumService`; qui solo la scelta
 * di accenderlo.
 */

interface Gate {
  method: string;
  /** il percorso come lo registra Fastify, parametri compresi */
  url: string;
  need: Toggle | Quota;
  /** quando la rotta fa anche cose che non chiedono il piano */
  when?: (body: unknown, params: unknown) => boolean;
}

const field = (body: unknown, key: string): unknown =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;

export const PLAN_GATES: readonly Gate[] = [
  { method: "POST", url: "/v1/jobs/dream", need: "dream" },
  { method: "POST", url: "/v1/meetings/join", need: "meetings" },
  // spegnere l'album (0 ore) resta sempre possibile
  { method: "PUT", url: "/v1/album/retention", need: "album", when: (b) => Number(field(b, "ore")) > 0 },
  { method: "POST", url: "/v1/rooms", need: "rooms" },
  { method: "POST", url: "/v1/gosini/births", need: "breedingSales" },
  // togliere dalla vetrina, o cedere gratis, non chiede il piano: vendere sì
  {
    method: "POST",
    url: "/v1/gosini/:id/vetrina",
    need: "breedingSales",
    when: (b) => field(b, "listed") === true && Number(field(b, "priceCents") ?? 0) > 0,
  },
  // ADR-132: entrare e invitare chiedono la piazza; rifiutare e bloccare mai
  { method: "POST", url: "/v1/piazza/presenza", need: "plaza" },
  { method: "POST", url: "/v1/piazza/inviti", need: "plaza" },
  { method: "POST", url: "/v1/piazza/inviti/:id/:azione", need: "plaza", when: (_b, p) => field(p, "azione") === "accetta" },
  // ADR-133: le cose che segue le guarda il sogno, quindi stanno col sogno
  { method: "POST", url: "/v1/tieni-d-occhio", need: "dream" },
];

const QUOTAS: readonly string[] = ["gosini", "rooms"] satisfies Quota[];

export function registerPlanGates(app: FastifyInstance, deps: { db: DbClient; plans: PlanGate }): void {
  app.addHook("preHandler", async (request, reply) => {
    const gate = PLAN_GATES.find((g) => g.method === request.method && g.url === request.routeOptions.url);
    if (gate === undefined || (gate.when !== undefined && !gate.when(request.body, request.params))) return undefined;
    // chi non si è presentato lo ferma il guardiano della rotta, con un 401
    if (request.tenant === null) return undefined;
    const scope = await resolveAccount(deps.db, request);
    if (!scope.ok) return undefined;
    const allowed = await withAccount(deps.db, scope.accountId, (tx) =>
      QUOTAS.includes(gate.need)
        ? deps.plans.hasRoom(tx, scope.accountId, gate.need as Quota)
        : deps.plans.allows(tx, scope.accountId, gate.need as Toggle),
    );
    if (allowed) return undefined;
    await needsPlan(reply, gate.need);
    return reply;
  });
}
