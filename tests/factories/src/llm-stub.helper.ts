import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Network-level provider stub (TESTING_PLAYBOOK §3, priority 2): Anthropic
 * offers no sandbox keys, so tests run the real HTTP stack against a local
 * server speaking the Messages API shape. Nothing in src/ is mocked — the
 * client performs a genuine network call and parses a genuine response.
 */

export interface CapturedRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: {
    model: string;
    max_tokens: number;
    system: { type: string; text: string; cache_control?: { type: string } }[];
    messages: { role: string; content: string }[];
  };
}

export interface StubResponsePlan {
  status?: number;
  text?: string;
  usage?: Partial<{
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  }>;
}

export class LlmStub {
  public baseUrl = "";
  public readonly requests: CapturedRequest[] = [];
  /** mutate per-test to change reply text/usage or force an error status */
  public nextResponse: StubResponsePlan = {};
  private server: Server | undefined;

  public async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as CapturedRequest["body"];
        this.requests.push({ path: req.url ?? "", headers: req.headers, body });

        const status = this.nextResponse.status ?? 200;
        if (status !== 200) {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify({ type: "error", error: { type: "api_error" } }));
          return;
        }
        const usage = {
          input_tokens: 120,
          output_tokens: 40,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 900,
          ...this.nextResponse.usage,
        };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_stub",
            type: "message",
            role: "assistant",
            model: body.model,
            content: [{ type: "text", text: this.nextResponse.text ?? "Grunf, ricevuto." }],
            usage,
          }),
        );
      });
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  public reset(): void {
    this.requests.length = 0;
    this.nextResponse = {};
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

export async function startLlmStub(): Promise<LlmStub> {
  const stub = new LlmStub();
  await stub.start();
  return stub;
}
