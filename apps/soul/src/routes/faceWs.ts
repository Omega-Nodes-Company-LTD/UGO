import websocket from "@fastify/websocket";
import type { ServerToFaceMessage } from "@ugo/shared";
import type { FastifyInstance } from "fastify";
import type { FaceGateway } from "../services/faceGateway.js";

/**
 * WS `/v1/face` (PROGETTO §5.7): bidirectional channel with the home body.
 * The face reconnects on its own (client-side backoff + offline queue).
 */
export async function registerFaceWs(app: FastifyInstance, gateway: FaceGateway): Promise<void> {
  await app.register(websocket);
  app.get("/v1/face", { websocket: true }, (socket) => {
    const send = (message: ServerToFaceMessage): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };
    // greet the freshly connected face with the current state and mood
    send({ type: "state", state: gateway.currentState() });
    const { vars, label } = gatewayMood(gateway);
    send({ type: "mood", label, vars });
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
