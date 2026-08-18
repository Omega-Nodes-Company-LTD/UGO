import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { beings, gosini, withAccount, type DbClient } from "@ugo/db";
import { searchMemories, type EmbeddingsClient } from "@ugo/memory";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DiaryService } from "../services/diaryService.js";
import { eldestExemplarOf, accountScope } from "./scope.js";

/**
 * Il server MCP: altri agenti interrogano la memoria di UGO (backlog gruppo 3).
 *
 * SOLA LETTURA, ed è il perimetro intero: tre strumenti che leggono ciò che il
 * proprietario può già leggere dal pannello — i ricordi, il diario, il branco.
 * Nessuno strumento scrive, nessuno tocca il provider (la ricerca passa dagli
 * embedding di Ollama, come la chat), e la biometria non esiste qui nemmeno
 * come conteggio.
 *
 * L'autenticazione è quella di casa: il token della famiglia nel Bearer, la
 * stessa porta di `/admin`. Un agente esterno con quel token è il proprietario
 * per procura — è il modello di fiducia dichiarato di tutto il servizio
 * (ADR-007: mono-utente, mai pubblico). Senza token, o col token di un'altra
 * casa, la risposta è quella di sempre: come se la casa non esistesse.
 *
 * Trasporto: Streamable HTTP in modalità STATELESS — un giro di server MCP per
 * richiesta, niente sessioni da tenere in vita. Costa un oggetto per chiamata
 * e rende impossibile l'errore che conta: uno stato condiviso fra due case.
 */

export interface McpRouteDeps {
  db: DbClient;
  embedder: EmbeddingsClient;
  /**
   * ADR-079: la chiave di casa, per leggere il diario **comunque sia scritto**.
   * Questo strumento restituiva `diary_entries.text` grezzo: funziona finché
   * il sogno scrive in chiaro, e il giorno che cifrasse avrebbe consegnato
   * base64 a un agente esterno senza che nessuno se ne accorgesse.
   */
  dataKey?: Buffer;
}

const MAX_K = 20;
const MAX_DIARY_DAYS = 30;

function buildMcpServer(deps: McpRouteDeps, accountId: string): McpServer {
  const server = new McpServer({ name: "ugo-memoria", version: "1.0.0" });

  server.registerTool(
    "cerca_ricordi",
    {
      description:
        "Cerca nella memoria a lungo termine di UGO (ricerca semantica). " +
        "Torna i ricordi più pertinenti alla domanda, con la loro data.",
      inputSchema: {
        domanda: z.string().min(2).max(500),
        quanti: z.number().int().min(1).max(MAX_K).optional(),
      },
    },
    async ({ domanda, quanti }) => {
      // ADR-062: ogni strumento apre il SUO tratto in casa — il giro MCP vive
      // sul socket per minuti, e una transazione lunga quanto la sessione
      // sarebbe il contrario di §1. L'embedding dentro è una chiamata locale
      // con timeout, lo stesso compromesso dichiarato dell'adozione della dote
      const found = await withAccount(deps.db, accountId, async (db) => {
        const gosinoId = await eldestExemplarOf(db, accountId);
        return searchMemories(db, deps.embedder, domanda, quanti ?? 6, new Date(), gosinoId);
      });
      const text =
        found.length === 0
          ? "Nessun ricordo pertinente."
          : found
              .map((memory) => `- (${memory.createdAt.toISOString().slice(0, 10)}) ${memory.text}`)
              .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "leggi_diario",
    {
      description:
        "Le ultime pagine del diario notturno di UGO: cosa ha vissuto e " +
        "distillato, una pagina per notte.",
      inputSchema: {
        giorni: z.number().int().min(1).max(MAX_DIARY_DAYS).optional(),
      },
    },
    async ({ giorni }) => {
      const pages = await withAccount(deps.db, accountId, async (db) => {
        const gosinoId = await eldestExemplarOf(db, accountId);
        return new DiaryService(db, deps.dataKey ?? Buffer.alloc(32)).pages(accountId, gosinoId, {
          limit: giorni ?? 7,
        });
      });
      const text =
        pages.length === 0
          ? "Il diario è ancora vuoto."
          : pages.map((page) => `## ${page.date}\n${page.text}`).join("\n\n");
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "il_branco",
    {
      description:
        "Chi vive in questa casa: le creature (gosini) e le persone e animali " +
        "che UGO conosce. Nomi e specie, mai biometria.",
      inputSchema: {},
    },
    async () => {
      const { alive, people } = await withAccount(deps.db, accountId, async (db) => ({
        alive: await db
          .select({ name: gosini.name, where: gosini.locationLabel })
          .from(gosini)
          .where(and(eq(gosini.accountId, accountId), isNull(gosini.retiredAt))),
        people: await db
          .select({ name: beings.displayName, species: beings.species, kind: beings.kind })
          .from(beings)
          .where(eq(beings.accountId, accountId)),
      }));
      const text = [
        "Gosini:",
        ...alive.map((c) => `- ${c.name}${c.where ? ` (${c.where})` : ""}`),
        "",
        "Il branco:",
        ...(people.length === 0
          ? ["- (nessuno ancora)"]
          : people.map((p) => `- ${p.name} (${p.species}, ${p.kind})`)),
      ].join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  return server;
}

export function registerMcpRoute(app: FastifyInstance, deps: McpRouteDeps): void {
  app.post("/v1/mcp", async (request, reply) => {
    // il token di casa decide QUALE memoria si interroga; admin, come /admin
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const server = buildMcpServer(deps, accountId);
    // stateless: nessun generatore di id di sessione, ogni POST è un mondo suo
    const transport = new StreamableHTTPServerTransport({});
    // da qui in poi risponde il transport sul socket nudo: Fastify si fa da parte
    reply.hijack();
    request.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    // il cast è di confine: i tipi dell'SDK non sono compilati con
    // exactOptionalPropertyTypes, ma l'oggetto È il Transport che si aspetta
    await server.connect(transport as Parameters<McpServer["connect"]>[0]);
    await transport.handleRequest(request.raw, reply.raw, request.body);
    return reply;
  });

  // il trasporto streamable prevede GET (stream) e DELETE (fine sessione):
  // in modalità stateless non esistono, e dirlo è più onesto di un 404
  for (const method of ["GET", "DELETE"] as const) {
    app.route({
      method,
      url: "/v1/mcp",
      handler: async (_request, reply) =>
        reply.code(405).send({ error: "stateless: solo POST" }),
    });
  }
}
