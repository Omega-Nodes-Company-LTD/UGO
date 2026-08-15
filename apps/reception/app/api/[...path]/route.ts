import { allow } from "../../../lib/limiter";

/**
 * Il BFF (ADR-051): l'unico punto in cui vive il segreto di servizio. Inoltra
 * `/api/*` a `/v1/reception/*` di soul sulla rete interna con la doppia
 * credenziale — il segreto in `Authorization`, il token del cliente
 * nell'header dedicato, preso dalla richiesta e mai da un cookie. Il client
 * non può ampliare la superficie: qualunque path finisce sotto
 * `/v1/reception/`, e il container non ha altre rotte da offrire.
 */

export const runtime = "nodejs";

const SOUL_URL = process.env.SOUL_URL ?? "http://soul:3000";

function serviceToken(): string {
  const value = process.env.UGO_RECEPTION_TOKEN ?? "";
  if (value === "") {
    // fail-fast alla prima richiesta: una reception senza segreto non inoltra
    throw new Error("UGO_RECEPTION_TOKEN is not configured");
  }
  return value;
}

async function forward(request: Request, params: Promise<{ path: string[] }>): Promise<Response> {
  const { path } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const customer = request.headers.get("x-reception-customer") ?? "";
  if (!allow(`${ip}:${customer.slice(0, 16)}`)) {
    return Response.json(
      {
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        detail: "Piano: la reception ha due orecchie sole.",
      },
      { status: 429, headers: { "retry-after": "30" } },
    );
  }

  const target = new URL(request.url);
  const upstream = new URL(
    `/v1/reception/${path.map((piece) => encodeURIComponent(piece)).join("/")}${target.search}`,
    SOUL_URL,
  );
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  const response = await fetch(upstream, {
    method: request.method,
    headers: {
      authorization: `Bearer ${serviceToken()}`,
      "x-reception-customer": customer,
      ...(body !== undefined && body !== "" && { "content-type": "application/json" }),
    },
    ...(body !== undefined && body !== "" && { body }),
    signal: AbortSignal.timeout(65_000),
  });
  // la risposta passa com'è: il problema+json di soul è già la lingua giusta
  const payload = await response.arrayBuffer();
  return new Response(payload.byteLength === 0 ? null : payload, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      ...(response.headers.has("retry-after") && {
        "retry-after": response.headers.get("retry-after") ?? "",
      }),
    },
  });
}

interface Context {
  params: Promise<{ path: string[] }>;
}

export function GET(request: Request, context: Context): Promise<Response> {
  return forward(request, context.params);
}
export function POST(request: Request, context: Context): Promise<Response> {
  return forward(request, context.params);
}
export function PUT(request: Request, context: Context): Promise<Response> {
  return forward(request, context.params);
}
export function PATCH(request: Request, context: Context): Promise<Response> {
  return forward(request, context.params);
}
export function DELETE(request: Request, context: Context): Promise<Response> {
  return forward(request, context.params);
}
