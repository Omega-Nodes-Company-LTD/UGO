import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Network-level Resend stub (TESTING_PLAYBOOK §3, priority 2): Resend has no
 * sandbox that delivers to a mailbox a test can read, so tests run the real
 * `fetch` against a local server speaking `POST /emails` and read what
 * arrived. Nothing in src/ is mocked — the mailer performs a genuine call.
 */

export interface SentMail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** the bearer the mailer sent: the API key travels in the header */
  authorization: string | undefined;
}

export class ResendStub {
  public baseUrl = "";
  public readonly sent: SentMail[] = [];
  /** force the next answers to fail with this status */
  public failWith: number | undefined;
  private server: Server | undefined;

  public async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        if (req.method !== "POST" || req.url !== "/emails") {
          res.writeHead(404).end();
          return;
        }
        if (this.failWith !== undefined) {
          res.writeHead(this.failWith, { "content-type": "application/json" });
          res.end(JSON.stringify({ name: "validation_error" }));
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Omit<SentMail, "authorization">;
        this.sent.push({ ...body, authorization: req.headers.authorization });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: `stub-${String(this.sent.length)}` }));
      });
    });
    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  /** The last mail sent to this address, if any. */
  public lastTo(address: string): SentMail | undefined {
    return this.sent.filter((mail) => mail.to.includes(address)).at(-1);
  }

  /** The first link in a mail's text: what a person would click. */
  public static linkIn(mail: SentMail): string | undefined {
    return /https?:\/\/\S+/.exec(mail.text)?.[0];
  }

  public reset(): void {
    this.sent.length = 0;
    this.failWith = undefined;
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

export async function startResendStub(): Promise<ResendStub> {
  const stub = new ResendStub();
  await stub.start();
  return stub;
}
