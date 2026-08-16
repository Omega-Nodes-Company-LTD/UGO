import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { beings, diaryEntries, gosini, type DbClient } from "@ugo/db";
import { searchMemories, type EmbeddingsClient } from "@ugo/memory";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eldestExemplarOf, householdScope } from "./scope.js";

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
}

const MAX_K = 20;
const MAX_DIARY_DAYS = 30;

function buildMcpServer(deps: McpRouteDeps, householdId: string): McpServer {
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
      const gosinoId = await eldestExemplarOf(deps.db, householdId);
      const found = await searchMemories(
        deps.db,
        deps.embedder,
        domanda,
        quanti ?? 6,
        new Date(),
        gosinoId,
      );
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
      const gosinoId = await eldestExemplarOf(deps.db, householdId);
      const pages = await deps.db
        .select({ date: diaryEntries.date, text: diaryEntries.text })
        .from(diaryEntries)
        .where(eq(diaryEntries.gosinoId, gosinoId))
        .orderBy(desc(diaryEntries.date))
        .limit(giorni ?? 7);
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
      const alive = await deps.db
        .select({ name: gosini.name, where: gosini.locationLabel })
        .from(gosini)
        .where(and(eq(gosini.householdId, householdId), isNull(gosini.retiredAt)));
      const people = await deps.db
        .select({ name: beings.displayName, species: beings.species, kind: beings.kind })
        .from(beings)
        .where(eq(beings.householdId, householdId));
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
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;

    const server = buildMcpServer(deps, householdId);
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
