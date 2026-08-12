import websocket from "@fastify/websocket";
import type { ServerToFaceMessage } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import type { FaceGateway } from "../services/faceGateway.js";

/**
 * WS `/v1/face` (PROGETTO §5.7): bidirectional channel with the home body.
 * The face reconnects on its own (client-side backoff + offline queue).
 *
 * ADR-036: a socket attaches to a ROOM, not to a creature. `?stanza=cucina`
 * hands the device everyone who lives in the kitchen; `?gosino=` still names
 * one exactly, and neither picks the default when nothing is asked.
 *
 * The senses fan out to everyone present, because **the room is what heard the
 * bang** — and watching two creatures react differently to the same noise is
 * the whole reason for putting them in one place. Speech does not: it goes to
 * one, or every sentence would cost the household N calls to the provider
 * (CLAUDE.md rule 3). Making them all answer is what the council is for, and
 * that runs on local models.
 */

/** Frames that belong to the room, and so reach every creature in it. */
export const SENSED_BY_THE_ROOM = new Set(["noise", "light", "tap", "shake", "face_seen", "mode"]);

interface RoomMember {
  id: string;
  name: string;
  gateway: FaceGateway;
  traits?: Record<string, number>;
}

export async function registerFaceWs(
  app: FastifyInstance,
  fallback: FaceGateway,
  registry?: {
    resolve: (query: string | undefined) => { id: string; name: string; gateway: FaceGateway } | undefined;
    inRoom: (room: string) => { id: string; name: string; gateway: FaceGateway }[];
  },
): Promise<void> {
  await app.register(websocket);
  app.get("/v1/face", { websocket: true }, (socket, request) => {
    const query = request.query as { gosino?: string; stanza?: string } | undefined;
    const members = pickMembers(registry, fallback, query);

    const raw = (message: ServerToFaceMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    // one tagged sender per creature: the body has to know which of them moved
    const senders = members.map((member) => {
      const send = (message: ServerToFaceMessage): void => {
        // the roster is the room's, not any one creature's: it is the only
        // frame that never carries a `who`
        raw(message.type === "roster" ? message : { ...message, who: member.id });
      };
      member.gateway.registerSender(send); // ADR-013: in-room voice for meetings
      return { member, send };
    });

    // the roster comes first: the body draws one creature per entry
    raw({
      type: "roster",
      ...(query?.stanza !== undefined && { room: query.stanza }),
      gosini: members.map((m) => ({
        id: m.id,
        name: m.name,
        ...(m.traits !== undefined && { traits: m.traits }),
      })),
    });

    for (const { member, send } of senders) {
      send({ type: "state", state: member.gateway.currentState() });
      const view = member.gateway.psycheView();
      send({ type: "mood", label: view.label, vars: view.vars });
      send({ type: "whoami", name: member.name });
    }

    socket.on("message", (incoming: Buffer | string) => {
      const text = String(incoming);
      const targets = forFrame(text, senders);
      for (const { member, send } of targets) {
        void member.gateway.handleRaw(text, send).catch(() => {
          // never let a single bad frame take the socket down; IDs-only logging
          app.log.warn({ gosino: member.id }, "face frame handling failed");
        });
      }
    });
    socket.on("close", () => {
      for (const { member, send } of senders) member.gateway.unregisterSender(send);
    });
  });
}

/** Who this socket is the body of: a room, one named creature, or the default. */
function pickMembers(
  registry: Parameters<typeof registerFaceWs>[2],
  fallback: FaceGateway,
  query: { gosino?: string; stanza?: string } | undefined,
): RoomMember[] {
  if (registry !== undefined && query?.stanza !== undefined && query.stanza !== "") {
    // an empty room stays empty: showing the wrong creature is worse than
    // showing nobody, which at least tells the truth about what is there
    return registry.inRoom(query.stanza);
  }
  const chosen = registry?.resolve(query?.gosino);
  if (chosen !== undefined) return [chosen];
  return [{ id: "", name: "UGO", gateway: fallback }];
}

/**
 * The senses belong to the room; speech belongs to one, for the budget.
 *
 * Generic over whatever the caller is holding, because this decides HOW MANY
 * and never looks inside: constraining it to a member type would have been a
 * type that lied about what the function reads.
 */
export function forFrame<T>(text: string, senders: T[]): T[] {
  let type: unknown;
  try {
    type = (JSON.parse(text) as { type?: unknown }).type;
  } catch {
    return senders.slice(0, 1); // unparseable: let one gateway produce the error
  }
  if (typeof type === "string" && SENSED_BY_THE_ROOM.has(type)) return senders;
  return senders.slice(0, 1);
}
