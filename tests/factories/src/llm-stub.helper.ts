import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Network-level provider stub (TESTING_PLAYBOOK §3, priority 2): the providers
 * offer no stable sandbox keys, so tests run the real HTTP stack against a
 * local server speaking their shapes. Nothing in src/ is mocked — the client
 * performs a genuine network call and parses a genuine response.
 *
 * It speaks (ADR-122):
 * - Anthropic `POST /v1/messages` and `GET /v1/models`;
 * - OpenRouter `POST /api/v1/chat/completions`, `GET /api/v1/models`,
 *   `GET /api/v1/key`;
 * - OpenAI `GET /v1/models` is the same path as Anthropic's and answers the
 *   same way; ElevenLabs `GET /v1/user`.
 *
 * A key equal to `BAD_KEY` is refused with 401 everywhere, so "the provider
 * rejected the key" is a real HTTP answer, not a branch in the test.
 */

export const BAD_KEY = "stub-bad-key";

export interface CapturedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: {
    model: string;
    max_tokens: number;
    system: { type: string; text: string; cache_control?: { type: string } }[];
    messages: { role: string; content: unknown }[];
    temperature?: number;
    thinking?: { type: string };
    output_config?: { effort: string };
    usage?: { include: boolean };
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
  /** OpenRouter only: the cost it declares */
  cost?: number;
}

/** What the stub's OpenRouter catalog lists. */
export const STUB_OPENROUTER_MODELS = [
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Anthropic: Claude Haiku 4.5",
    context_length: 200000,
    pricing: { prompt: "0.000001", completion: "0.000005" },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
  },
  {
    id: "mistralai/mistral-small",
    name: "Mistral Small",
    context_length: 32000,
    pricing: { prompt: "0.0000002", completion: "0.0000006" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  },
];

function keyOf(req: IncomingMessage): string | undefined {
  const bearer = req.headers.authorization;
  if (typeof bearer === "string") return bearer.replace(/^Bearer\s+/i, "");
  const anthropic = req.headers["x-api-key"];
  if (typeof anthropic === "string") return anthropic;
  const eleven = req.headers["xi-api-key"];
  return typeof eleven === "string" ? eleven : undefined;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

export class LlmStub {
  public baseUrl = "";
  public readonly requests: CapturedRequest[] = [];
  /** mutate per-test to change reply text/usage or force an error status */
  public nextResponse: StubResponsePlan = {};
  private server: Server | undefined;

  private answer(req: IncomingMessage, res: ServerResponse, raw: string): void {
    const path = (req.url ?? "").split("?")[0] ?? "";
    const body = (raw === "" ? {} : JSON.parse(raw)) as CapturedRequest["body"];
    this.requests.push({ method: req.method ?? "GET", path, headers: req.headers, body });

    if (keyOf(req) === BAD_KEY) {
      json(res, 401, { error: { type: "authentication_error" } });
      return;
    }
    const status = this.nextResponse.status ?? 200;
    if (req.method === "POST" && status !== 200) {
      json(res, status, { type: "error", error: { type: "api_error" } });
      return;
    }
    const usage = {
      input_tokens: 120,
      output_tokens: 40,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 900,
      ...this.nextResponse.usage,
    };
    const text = this.nextResponse.text ?? "Grunf, ricevuto.";

    switch (`${req.method ?? ""} ${path}`) {
      case "POST /v1/messages":
        json(res, 200, {
          id: "msg_stub",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [
            { type: "thinking", thinking: "" },
            { type: "text", text },
          ],
          usage,
        });
        return;
      case "POST /api/v1/chat/completions":
        json(res, 200, {
          id: "gen-stub",
          model: body.model,
          choices: [{ message: { role: "assistant", content: text } }],
          usage: {
            prompt_tokens: usage.input_tokens + usage.cache_read_input_tokens,
            completion_tokens: usage.output_tokens,
            prompt_tokens_details: { cached_tokens: usage.cache_read_input_tokens },
            ...(this.nextResponse.cost !== undefined && { cost: this.nextResponse.cost }),
          },
        });
        return;
      case "GET /v1/models":
        json(res, 200, {
          data: [
            { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5", type: "model" },
            { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", type: "model" },
            { id: "claude-unpriced-9", display_name: "Unpriced", type: "model" },
          ],
          has_more: false,
        });
        return;
      case "GET /api/v1/models":
        json(res, 200, { data: STUB_OPENROUTER_MODELS });
        return;
      case "GET /api/v1/key":
      case "GET /v1/user":
        json(res, 200, { data: { label: "stub" } });
        return;
      default:
        json(res, 404, { error: "not found" });
    }
  }

  public async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        this.answer(req, res, Buffer.concat(chunks).toString());
      });
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  /** Only the generation calls: catalogs and key probes are not "the model". */
  public get completions(): CapturedRequest[] {
    return this.requests.filter((r) => r.method === "POST");
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
