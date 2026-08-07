import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { MeetingsService } from "../services/meetingsService.js";

const joinRequestSchema = z.object({
  url: z.url(),
  title: z.string().max(200).optional(),
});

function problem(reply: FastifyReply, status: number, title: string, detail?: string): void {
  void reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

/** POST /v1/meetings/join (PROGETTO §5.7): launches the Vexa bot. */
export function registerMeetingsRoutes(app: FastifyInstance, service: MeetingsService): void {
  app.post("/v1/meetings/join", async (request, reply) => {
    const parsed = joinRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid meeting request", z.prettifyError(parsed.error));
      return;
    }
    try {
      const ref = await service.join(parsed.data.url, parsed.data.title);
      return await reply.code(201).send(ref);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "join failed";
      if (/unsupported|unrecognized/.test(detail)) {
        problem(reply, 422, "Unsupported meeting url", detail);
        return;
      }
      problem(reply, 502, "Meeting bot unavailable", detail);
    }
  });
}
