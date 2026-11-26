import type { ServerToFaceMessage } from "@ugo/shared";
import WebSocket from "ws";

/**
 * Il client di un muso, com'è nella webapp: frame JSON su un WebSocket vero.
 * Condiviso fra i test del socket del muso.
 */
export interface FaceTestClient {
  send: (message: Record<string, unknown>) => void;
  received: ServerToFaceMessage[];
  waitFor: (type: ServerToFaceMessage["type"], count?: number) => Promise<ServerToFaceMessage>;
  close: () => Promise<void>;
}

export async function connectFace(url: string): Promise<FaceTestClient> {
  const socket = new WebSocket(url);
  const received: ServerToFaceMessage[] = [];
  const waiters: { predicate: () => ServerToFaceMessage | undefined; resolve: (m: ServerToFaceMessage) => void }[] = [];
  socket.on("message", (raw: Buffer) => {
    received.push(JSON.parse(raw.toString()) as ServerToFaceMessage);
    for (const waiter of [...waiters]) {
      const match = waiter.predicate();
      if (match !== undefined) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(match);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    send: (message) => {
      socket.send(JSON.stringify(message));
    },
    received,
    waitFor: (type, count = 1) =>
      new Promise((resolve, reject) => {
        const predicate = (): ServerToFaceMessage | undefined => {
          const matches = received.filter((m) => m.type === type);
          return matches.length >= count ? matches[count - 1] : undefined;
        };
        const immediate = predicate();
        if (immediate !== undefined) {
          resolve(immediate);
          return;
        }
        waiters.push({ predicate, resolve });
        setTimeout(() => {
          reject(new Error(`timed out waiting for "${type}" x${String(count)}`));
        }, 15_000);
      }),
    close: () =>
      new Promise((resolve) => {
        socket.once("close", () => {
          resolve();
        });
        socket.close();
      }),
  };
}
