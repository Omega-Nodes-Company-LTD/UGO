import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Network-level stub of the Vexa open-core API v0.12 (playbook §3 P2 — a
 * real Vexa stack needs a headless-Chrome fleet and a live Meet call).
 * Shapes follow the official README: POST /bots, GET /transcripts/{p}/{id},
 * DELETE /bots/{p}/{id}. /speak intentionally 404s like open-core does.
 */

export interface VexaSegment {
  speaker: string | null;
  start: number;
  end: number;
  text: string;
}

export class VexaStub {
  public baseUrl = "";
  public readonly botsCreated: Record<string, unknown>[] = [];
  public readonly botsDeleted: string[] = [];
  public segments: VexaSegment[] = [];
  public lastApiKey: string | undefined;
  private server: Server | undefined;

  public async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        this.lastApiKey = req.headers["x-api-key"] as string | undefined;
        const url = req.url ?? "";
        const respond = (status: number, body: unknown): void => {
          const data = JSON.stringify(body);
          res.writeHead(status, { "content-type": "application/json" });
          res.end(data);
        };
        if (req.method === "POST" && url === "/bots") {
          this.botsCreated.push(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>);
          respond(201, { status: "requested" });
          return;
        }
        if (req.method === "DELETE" && url.startsWith("/bots/")) {
          this.botsDeleted.push(url);
          respond(200, { status: "stopping" });
          return;
        }
        if (req.method === "GET" && url.startsWith("/transcripts/")) {
          respond(200, { segments: this.segments });
          return;
        }
        if (url.includes("/speak")) {
          respond(404, { detail: "not available in open-core" });
          return;
        }
        respond(404, { detail: "not found" });
      });
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

export async function startVexaStub(): Promise<VexaStub> {
  const stub = new VexaStub();
  await stub.start();
  return stub;
}
