import { customers, phoneCalls, type DbClient } from "@ugo/db";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { audioPath, audioSigningKey, sameSecret, verifyAudio } from "../services/phone/phoneCrypto.js";
import type { PhoneAudioStore } from "../services/phone/phoneMemory.js";
import type { PhoneService } from "../services/phone/phoneService.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Le porte del telefono (ADR-128, contratto C4 con Omega HQ).
 *
 * - `POST /v1/phone/turn`: HQ, col segreto dedicato `UGO_PHONE_TOKEN` — non
 *   il token interno né quello della reception, perché ruotare una porta non
 *   deve toccare le altre. HQ ha già fatto il suo controllo «soldi e reclami
 *   → una persona» prima di chiamarci.
 * - `GET /v1/phone/audio/:id`: Twilio, senza intestazioni — l'URL è firmato e
 *   scade in dieci minuti.
 * - `GET /v1/phone/calls`: il pannello, solo i numeri delle chiamate.
 */

const turnSchema = z.object({
  callId: z.string().regex(/^[A-Za-z0-9]{6,64}$/u),
  turn: z.number().int().min(1).max(500),
  text: z.string().trim().min(1).max(1000),
  language: z.enum(["it", "en"]).default("it"),
  customerEmail: z.email().max(254).optional(),
});

export interface PhoneRouteDeps {
  db: DbClient;
  token: string;
  service: PhoneService;
  audio: PhoneAudioStore;
  guard: PreHandler;
}

async function problem(reply: FastifyReply, status: number, title: string): Promise<FastifyReply> {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status });
}

/** L'origine pubblica, quella che Twilio vedrà: dietro Coolify la dice il proxy. */
function publicOrigin(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-proto"];
  const proto = typeof forwarded === "string" && forwarded !== "" ? forwarded.split(",")[0] : request.protocol;
  return `${proto ?? "https"}://${request.host}`;
}

export function registerPhoneRoutes(app: FastifyInstance, deps: PhoneRouteDeps): void {
  const key = audioSigningKey(deps.token);

  app.post("/v1/phone/turn", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    const header = request.headers.authorization ?? "";
    const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (given === "" || !sameSecret(given, deps.token)) {
      request.log.warn({ url: request.url }, "unauthorized attempt on the phone");
      return problem(reply, 401, "Unauthorized");
    }
    const parsed = turnSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid phone turn");

    const now = new Date();
    const result = await deps.service.turn(
      {
        callId: parsed.data.callId,
        turn: parsed.data.turn,
        text: parsed.data.text,
        language: parsed.data.language,
        ...(parsed.data.customerEmail !== undefined && { customerEmail: parsed.data.customerEmail }),
      },
      now,
    );
    // senza audio (salvadanaio vuoto, voce giù) HQ dice il testo con la sua
    // voce: meglio una voce non nostra che il silenzio su una linea aperta
    let audioUrl: string | null = null;
    if (result.audio !== undefined) {
      const stored = deps.audio.put(result.audio, now.getTime());
      audioUrl = publicOrigin(request) + audioPath(key, stored.id, stored.expiresAt);
    }
    return { text: result.text, audioUrl, handover: result.handover };
  });

  app.get("/v1/phone/audio/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { exp, sig } = request.query as { exp?: string; sig?: string };
    const now = Date.now();
    const verdict = verifyAudio(key, id, exp, sig, now);
    if (verdict !== "ok") return problem(reply, 403, verdict === "expired" ? "Expired" : "Forbidden");
    const audio = deps.audio.get(id, now);
    if (audio === undefined) return problem(reply, 404, "Not Found");
    return reply.type("audio/mpeg").header("cache-control", "no-store").send(audio);
  });

  app.get("/v1/phone/calls", { preHandler: deps.guard }, async (request, reply) => {
    const body = await inAccount(deps.db, request, reply, {}, async (tx, accountId) => {
      const rows = await tx
        .select({
          startedAt: phoneCalls.startedAt,
          lastTurnAt: phoneCalls.lastTurnAt,
          turns: phoneCalls.turns,
          handovers: phoneCalls.handovers,
          costUsd: phoneCalls.costUsd,
          outcome: phoneCalls.outcome,
          customer: customers.name,
        })
        .from(phoneCalls)
        .leftJoin(customers, eq(customers.id, phoneCalls.customerId))
        .where(eq(phoneCalls.accountId, accountId))
        .orderBy(desc(phoneCalls.startedAt))
        .limit(30);
      return {
        calls: rows.map((row) => ({
          startedAt: row.startedAt.toISOString(),
          seconds: Math.round((row.lastTurnAt.getTime() - row.startedAt.getTime()) / 1000),
          turns: row.turns,
          handovers: row.handovers,
          costUsd: Number(row.costUsd),
          outcome: row.outcome,
          customer: row.customer,
        })),
      };
    });
    return body ?? reply;
  });
}
