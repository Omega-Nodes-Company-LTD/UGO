import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateDataKey } from "@ugo/shared";
import { headerSecret } from "../config/env.js";

/**
 * I segreti di una casa locale (ADR-132 §5): file a permessi 0600 in una
 * cartella sola, mai variabili stampabili, mai dentro l'archivio.
 *
 *  - `data.key`        la chiave maestra, nata qui al primo avvio (l'archivio non
 *                      porta la chiave della sorgente: ricifra con questa);
 *  - `internal.token`  il segreto delle rotte interne, nato qui;
 *  - `openrouter.key`  la chiave DELL'UTENTE, scritta una volta dal `/setup`.
 *
 * Si scrive con rename atomico: un file a metà non si vede mai, e uno spegnimento
 * a metà non lascia una chiave troncata che poi «sembra» valida.
 */
export class HomeSecrets {
  public constructor(private readonly dir: string) {}

  public get incomingDir(): string {
    return join(this.dir, "incoming");
  }

  private path(name: string): string {
    return join(this.dir, name);
  }

  private async readText(name: string): Promise<string | undefined> {
    try {
      return (await readFile(this.path(name), "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async writeAtomic(name: string, value: string): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const temp = this.path(`${name}.${randomBytes(4).toString("hex")}.tmp`);
    await writeFile(temp, value, { mode: 0o600 });
    // su Windows il mode è ignorato: chmod esplicito dove ha senso, e comunque la cartella è dell'utente
    await chmod(temp, 0o600).catch(() => undefined);
    await rename(temp, this.path(name));
  }

  /** La chiave maestra: si legge, o si crea la prima volta. */
  public async dataKey(): Promise<Buffer> {
    const existing = await this.readText("data.key");
    if (existing !== undefined && existing !== "") return Buffer.from(existing, "base64");
    const key = generateDataKey();
    await this.writeAtomic("data.key", key.toString("base64"));
    return key;
  }

  public async internalToken(): Promise<string> {
    const existing = await this.readText("internal.token");
    if (existing !== undefined && existing !== "") return existing;
    const token = randomBytes(32).toString("base64url");
    await this.writeAtomic("internal.token", token);
    return token;
  }

  public async openRouterKey(): Promise<string | undefined> {
    const text = await this.readText("openrouter.key");
    return text === undefined || text === "" ? undefined : text;
  }

  /**
   * Pulisce (ADR-131 §8: spazi e invisibili ai bordi) e verifica la forma. Il
   * messaggio dell'errore dice COSA non va, mai il valore.
   */
  public static cleanKey(raw: string): string | undefined {
    const parsed = headerSecret.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }

  public async writeOpenRouterKey(key: string): Promise<void> {
    await this.writeAtomic("openrouter.key", key);
  }

  /** L'archivio in arrivo: vive qui, cifrato com'è, finché non è installato. */
  public async discardIncoming(): Promise<void> {
    await rm(this.incomingDir, { recursive: true, force: true });
  }
}
