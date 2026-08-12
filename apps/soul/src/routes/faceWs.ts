import websocket from "@fastify/websocket";
import type { ServerToFaceMessage } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import type { FaceGateway } from "../services/faceGateway.js";

/**
 * WS `/v1/face` (PROGETTO §5.7): bidirectional channel with the home body.
 * The face reconnects on its own (client-side backoff + offline queue).
 */
export async function registerFaceWs(
  app: FastifyInstance,
  fallback: FaceGateway,
  /** ADR-032: which exemplar this socket wants to be the body of */
  registry?: { resolve: (query: string | undefined) => { gateway: FaceGateway; name: string } | undefined },
): Promise<void> {
  await app.register(websocket);
  app.get("/v1/face", { websocket: true }, (socket, request) => {
    const wanted = (request.query as { gosino?: string } | undefined)?.gosino;
    const chosen = registry?.resolve(wanted);
    const gateway = chosen?.gateway ?? fallback;
    const send = (message: ServerToFaceMessage): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };
    // greet the freshly connected face with the current state and mood
    send({ type: "state", state: gateway.currentState() });
    const { vars, label } = gatewayMood(gateway);
    send({ type: "mood", label, vars });
    // the device is told who it got: an unknown name falls back to the default
    // rather than showing nothing, so the dock must be able to say whose face
    // this actually is
    if (chosen !== undefined) send({ type: "whoami", name: chosen.name });
    gateway.registerSender(send); // ADR-013: in-room voice for meeting answers

    socket.on("message", (raw: Buffer | string) => {
      void gateway.handleRaw(String(raw), send).catch(() => {
        // never let a single bad frame take the socket down; IDs-only logging
        app.log.warn("face frame handling failed");
      });
    });
    socket.on("close", () => {
      gateway.unregisterSender(send);
    });
  });
}

function gatewayMood(gateway: FaceGateway): { vars: Record<string, number>; label: string } {
  const view = gateway.psycheView();
  return { vars: view.vars, label: view.label };
}
