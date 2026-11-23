import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Chi può parlare col `/setup`. Una macchina appena installata è la più
 * vulnerabile che UGO abbia: non ha ancora un proprietario, quindi chiunque
 * raggiunga la porta potrebbe consegnarle la propria anima e la propria chiave.
 * Tre difese, tutte indipendenti:
 *
 *  1. **Un gettone di setup**, nato a ogni avvio e stampato SOLO sulla console
 *     di chi ha lanciato il programma (e passato dal lanciatore nel frammento
 *     dell'indirizzo, che non viaggia in rete). Chi sta sulla stessa rete ma non
 *     sulla macchina non lo vede.
 *  2. **Host ammesso**: solo `localhost`/`127.0.0.1`/`[::1]`. Contro il DNS
 *     rebinding: una pagina web qualunque non può far parlare il browser
 *     dell'utente con questa porta sotto un nome suo.
 *  3. **Stessa origine** nelle richieste che scrivono.
 *
 * Più un limite ai tentativi falliti: la frase vale 120 bit, ma un setup che
 * accetta infiniti tentativi è un setup scritto male.
 */
export class SetupGuard {
  public readonly token = randomBytes(24).toString("base64url");
  private failures = 0;

  public constructor(private readonly maxFailures = 10) {}

  public static hostAllowed(host: string | undefined): boolean {
    if (host === undefined) return false;
    const bare = host.replace(/:\d+$/u, "").toLowerCase();
    return bare === "localhost" || bare === "127.0.0.1" || bare === "[::1]";
  }

  private static sameOrigin(origin: string, host: string | undefined): boolean {
    try {
      return new URL(origin).host === host;
    } catch {
      return false; // `Origin: null` e simili
    }
  }

  private tokenMatches(given: string | undefined): boolean {
    if (given === undefined) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  public noteFailure(): void {
    this.failures += 1;
  }

  public get locked(): boolean {
    return this.failures >= this.maxFailures;
  }

  /** La pagina si serve a chi ha l'host giusto; il gettone serve alle chiamate. */
  public pageGuard = (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    if (!SetupGuard.hostAllowed(request.headers.host)) {
      void reply.code(421).send({ error: "host non ammesso: apri http://localhost" });
      return;
    }
    done();
  };

  public apiGuard = (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    if (!SetupGuard.hostAllowed(request.headers.host)) {
      void reply.code(421).send({ error: "host non ammesso: apri http://localhost" });
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !SetupGuard.sameOrigin(origin, request.headers.host)) {
      void reply.code(403).send({ error: "origine non ammessa" });
      return;
    }
    const header = request.headers["x-setup-token"];
    if (!this.tokenMatches(typeof header === "string" ? header : undefined)) {
      void reply.code(401).send({ error: "gettone di setup mancante o errato: riapri il link dal programma di avvio" });
      return;
    }
    if (this.locked) {
      void reply.code(429).send({ error: "troppi tentativi falliti: riavvia UGO per riprovare" });
      return;
    }
    done();
  };
}
