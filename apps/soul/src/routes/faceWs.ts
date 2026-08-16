import websocket from "@fastify/websocket";
import type { SceneProp, ServerToFaceMessage } from "@ugo/shared";
import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import type { FaceGateway } from "../services/faceGateway.js";
import type { SceneHub } from "../services/sceneHub.js";
import { whoAnswers, type Candidate } from "../services/whoAnswers.js";
import { resolveHousehold } from "./scope.js";

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
  /** ADR-056: in che stanza vive, per sapere di quale arredamento parlargli */
  where?: string;
}

/** What the registry hands back for one creature. */
interface RegistryEntry {
  id: string;
  name: string;
  gateway: FaceGateway;
  character?: { traits: Record<string, number> };
  where?: string | undefined;
}

const asMember = (entry: RegistryEntry): RoomMember => ({
  id: entry.id,
  name: entry.name,
  gateway: entry.gateway,
  ...(entry.character !== undefined && { traits: entry.character.traits }),
  ...(entry.where !== undefined && { where: entry.where }),
});

export async function registerFaceWs(
  app: FastifyInstance,
  fallback: FaceGateway,
  db: DbClient,
  registry?: {
    resolve: (query: string | undefined, householdId: string) => RegistryEntry | undefined;
    inRoom: (room: string, householdId: string) => RegistryEntry[];
  },
  /** ADR-056: gli arredi della stanza, e le loro modifiche a scena aperta */
  scene?: {
    hub: SceneHub;
    props: (householdId: string, roomSlug: string) => Promise<SceneProp[]>;
  },
): Promise<void> {
  await app.register(websocket);
  app.get("/v1/face", { websocket: true }, (socket, request) => {
    const query = request.query as { gosino?: string; stanza?: string } | undefined;

    // Which house this body is the body of has to be asked of the database
    // (a token may speak for one house, or an operator for the only one), and
    // that is a round trip. Frames that land during it are held rather than
    // dropped: a face reconnecting mid-sentence would otherwise lose it, and
    // "he ignored me once after a reconnect" is not a bug anyone can report.
    let deliver: ((text: string) => void) | undefined;
    const waiting: string[] = [];
    socket.on("message", (incoming: Buffer | string) => {
      const text = String(incoming);
      if (deliver === undefined) waiting.push(text);
      else deliver(text);
    });

    void (async () => {
      // no token means no house, and the single fallback creature answers —
      // exactly the behaviour of every version before ADR-019
      const scope = await resolveHousehold(db, request);
      const members = pickMembers(
        registry,
        fallback,
        query,
        scope.ok ? scope.householdId : undefined,
      );

      const raw = (message: ServerToFaceMessage): void => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      };

      // one tagged sender per creature: the body has to know which of them moved
      const senders = members.map((member) => {
        const send = (message: ServerToFaceMessage): void => {
          // the roster is the room's, not any one creature's: it never carries
          // a `who`, and since ADR-056 neither does `scene` — un cuscino non è
          // di nessuno dei due, è della stanza. Nor does anything in a house
          // that has no registry — `who: ""` would be noise standing for "the
          // only one", and this keeps the single-creature wire format
          // byte-identical to what every face before rooms already speaks.
          const who = tagFor(member.id);
          // glimpse_ask è della stanza come scene: la camera è una sola
          if (
            message.type === "roster" ||
            message.type === "scene" ||
            message.type === "glimpse_ask" ||
            who === undefined
          ) {
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

      const room = roomForSocket(query, members);
      const stopWatching =
        scene !== undefined && room !== undefined && scope.ok
          ? scene.hub.watch(scope.householdId, room, raw)
          : undefined;

      const release = (): void => {
        for (const { member, send } of senders) member.gateway.unregisterSender(send);
        stopWatching?.();
      };
      // it may have gone while we were asking the database who lives here
      if (socket.readyState !== socket.OPEN) {
        release();
        return;
      }
      socket.on("close", release);

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

      // l'arredamento subito dopo il roster: il corpo monta la stanza prima di
      // metterci dentro qualcuno che ci deve camminare
      if (scene !== undefined && room !== undefined && scope.ok) {
        try {
          raw({ type: "scene", props: await scene.props(scope.householdId, room) });
        } catch {
          // una stanza senza arredi non è un errore, e un errore qui non deve
          // impedire alla creatura di comparire: il corpo funziona spoglio
          app.log.warn({ room }, "scene lookup failed");
        }
      }

      for (const { member, send } of senders) {
        send({ type: "state", state: member.gateway.currentState() });
        const view = member.gateway.psycheView();
        send({ type: "mood", label: view.label, vars: view.vars });
        send({ type: "whoami", name: member.name });
      }

      deliver = (text: string): void => {
        const targets = forFrame(text, senders);
        for (const { member, send } of targets) {
          void member.gateway
            .handleRaw(text, send)
            .then((accepted) => {
              // `false` means the contract refused the frame, and until now
              // nobody was listening for it: a `heard_text` whose voice clip
              // was one byte over the cap was dropped here, in silence, and
              // the only visible effect was UGO never answering. A refusal is
              // as much a fault as a throw, and now says so.
              if (!accepted) {
                app.log.warn(
                  { gosino: member.id, bytes: text.length },
                  "face frame refused by the contract",
                );
              }
            })
            .catch(() => {
              // never let a single bad frame take the socket down; IDs-only logging
              app.log.warn({ gosino: member.id }, "face frame handling failed");
            });
        }
      };
      for (const held of waiting.splice(0)) deliver(held);
    })();
  });
}

/** Who this socket is the body of: a room, one named creature, or the default. */
function pickMembers(
  registry: Parameters<typeof registerFaceWs>[3],
  fallback: FaceGateway,
  query: { gosino?: string; stanza?: string } | undefined,
  householdId: string | undefined,
): RoomMember[] {
  if (
    registry !== undefined &&
    householdId !== undefined &&
    query?.stanza !== undefined &&
    query.stanza !== ""
  ) {
    // an empty room stays empty: showing the wrong creature is worse than
    // showing nobody, which at least tells the truth about what is there
    return registry.inRoom(query.stanza, householdId).map(asMember);
  }
  const chosen =
    householdId === undefined ? undefined : registry?.resolve(query?.gosino, householdId);
  if (chosen !== undefined) return [asMember(chosen)];
  return [{ id: "", name: "UGO", gateway: fallback }];
}

/**
 * ADR-056: di quale stanza è questo schermo.
 *
 * `?stanza=` lo dice, ed è la risposta più forte perché è esplicita. Ma un
 * chiosco indirizzato `?gosino=` — che è la configurazione in uso oggi —
 * altrimenti non vedrebbe **mai** un arredo, perché non avrebbe mai una
 * stanza: eredita quella in cui la creatura vive, che è la stessa `where` che
 * il pannello usa per decidere su quale schermo compare.
 *
 * `undefined` quando non c'è né l'una né l'altra: un corpo senza stanza è un
 * corpo senza arredamento, e va bene — mostrargli quello di una stanza a caso
 * sarebbe molto peggio che non mostrargli niente.
 */
export function roomForSocket(
  query: { stanza?: string } | undefined,
  members: readonly { where?: string }[],
): string | undefined {
  const asked = query?.stanza;
  if (asked !== undefined && asked !== "") return asked;
  const lives = members[0]?.where;
  return lives === undefined || lives === "" ? undefined : lives;
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
  let frame: { type?: unknown; who?: unknown };
  try {
    frame = JSON.parse(text) as { type?: unknown; who?: unknown };
  } catch {
    return senders.slice(0, 1); // unparseable: let one gateway produce the error
  }
  // ADR-056: un frame che dice **chi** è stato va a quello lì e a nessun altro.
  // Sorteggiarlo come si sorteggia chi risponde a una frase manderebbe il
  // sollievo dalla noia alla creatura che era rimasta ferma.
  if (typeof frame.who === "string" && frame.who !== "") {
    const named = senders.filter((sender) => sender.id === frame.who);
    if (named.length > 0) return named;
  }
  if (typeof frame.type === "string" && SENSED_BY_THE_ROOM.has(frame.type)) return senders;
  return one();
}
