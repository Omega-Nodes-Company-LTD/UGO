import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";

/**
 * Cosa è acceso, cosa è spento, e **perché** (2026-08-17).
 *
 * Tre volte di fila il proprietario ha trovato una funzione che non c'era, e
 * tre volte il prodotto gli ha risposto qualcosa di educato invece della
 * verità: «la camera non mi funziona» quando manca `OLLAMA_VISION_MODEL`, un
 * cielo sereno durante un temporale quando la casa non ha coordinate, un
 * «cerca:» che non esisteva quando manca `SEARXNG_URL`. Ogni volta la
 * diagnosi è finita in una sessione di lettura del codice.
 *
 * Una funzione spenta è uno stato legittimo — quasi tutte qui sono
 * facoltative per progetto. Una funzione spenta che **finge di essere accesa
 * e rotta** non lo è: manda a cercare un guasto dove c'è solo una
 * configurazione. Questa rotta esiste perché il pannello possa dire quale
 * delle due cose sta succedendo.
 *
 * Guardata: dice come è messa l'installazione, e non è affare del corpo.
 */

export interface Capability {
  /** chiave stabile, per il pannello */
  id: string;
  /** come la chiama una persona, non come si chiama la variabile */
  label: string;
  on: boolean;
  /**
   * Perché è spenta, in italiano piano e con dentro il nome della cosa da
   * impostare. Vuoto quando è accesa: se funziona non c'è niente da spiegare.
   */
  why?: string;
}

export interface CapabilitiesDeps {
  guard: PreHandler;
  /** valutate a ogni richiesta: una chiave aggiunta stanotte si vede stamattina */
  snapshot: () => Capability[];
}

export function registerCapabilitiesRoute(app: FastifyInstance, deps: CapabilitiesDeps): void {
  app.get("/v1/capabilities", { preHandler: deps.guard }, async (_request, reply) =>
    reply.send({ capabilities: deps.snapshot() }),
  );
}
