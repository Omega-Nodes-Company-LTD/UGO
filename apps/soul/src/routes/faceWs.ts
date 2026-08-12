import websocket from "@fastify/websocket";
import type { ServerToFaceMessage } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import type { FaceGateway } from "../services/faceGateway.js";
import { whoAnswers, type Candidate } from "../services/whoAnswers.js";

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
  /**
   * His genome (ADR-015), so the body can build HIM and not a default pig.
   * This was declared and never filled: the runtime carries it under
   * `character.traits`, nothing mapped it across, and every creature in a room
   * therefore rendered identical — the same pink pig twice, which is exactly
   * what a room of several is supposed to stop looking like.
   */
  traits?: Record<string, number>;
}

/** What the registry hands back for one creature. */
interface RegistryEntry {
  id: string;
  name: string;
  gateway: FaceGateway;
  character?: { traits: Record<string, number> };
}

const asMember = (entry: RegistryEntry): RoomMember => ({
  id: entry.id,
  name: entry.name,
  gateway: entry.gateway,
  ...(entry.character !== undefined && { traits: entry.character.traits }),
});

export async function registerFaceWs(
  app: FastifyInstance,
  fallback: FaceGateway,
  registry?: {
    resolve: (query: string | undefined) => RegistryEntry | undefined;
    inRoom: (room: string) => RegistryEntry[];
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
        // frame that never carries a `who`. Nor does anything in a house that
        // has no registry — `who: ""` would be noise standing for "the only
        // one", and this keeps the single-creature wire format byte-identical
        // to what every face before rooms already speaks.
        const who = tagFor(member.id);
        if (message.type === "roster" || who === undefined) {
          raw(message);
          return;
        }
        raw({ ...message, who });
      };
      member.gateway.registerSender(send); // ADR-013: in-room voice for meetings
      // ADR-040: `id` and `traits` are what choosing a speaker reads, so they
      // travel with the sender rather than being looked up again
      return { member, send, id: member.id, traits: member.traits };
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
    return registry.inRoom(query.stanza).map(asMember);
  }
  const chosen = registry?.resolve(query?.gosino);
  if (chosen !== undefined) return [asMember(chosen)];
  return [{ id: "", name: "UGO", gateway: fallback }];
}

/**
 * The `who` a frame should carry, if any.
 *
 * Empty means there is no registry and so no room: one nameless creature, the
 * way it has always been. Tagging that with an empty string would be noise
 * standing for "the only one".
 */
export function tagFor(id: string): string | undefined {
  return id === "" ? undefined : id;
}

/**
 * The senses belong to the room; speech belongs to one, for the budget.
 *
 * ADR-040: "one" used to mean `slice(0, 1)`, and the roster comes back ordered
 * by `bornAt` — so the eldest answered every sentence and nobody else ever
 * spoke. Which one it is, is a question about character, and `whoAnswers`
 * settles it from the genome.
 *
 * `roll` is injected so a test can ask about the distribution instead of
 * hoping. Undefined means draw one: the caller in production wants a creature
 * that is not perfectly predictable.
 */
export function forFrame<T extends Candidate>(text: string, senders: T[], roll?: number): T[] {
  const one = (): T[] => whoAnswers(senders, roll ?? Math.random());
  let type: unknown;
  try {
    type = (JSON.parse(text) as { type?: unknown }).type;
  } catch {
    return senders.slice(0, 1); // unparseable: let one gateway produce the error
  }
  if (typeof type === "string" && SENSED_BY_THE_ROOM.has(type)) return senders;
  return one();
}
