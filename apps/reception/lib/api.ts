"use client";

import { token } from "./session";

/**
 * Il filo verso soul: ogni chiamata passa dal BFF (`/api/*`), che aggiunge il
 * segreto di servizio lato server (ADR-051). Da qui esce solo il token del
 * cliente, nell'header dedicato — mai in `Authorization`.
 */

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined) headers.set("content-type", "application/json");
  headers.set("x-reception-customer", token());
  const response = await fetch(`/api${path}`, { ...options, headers });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 204 e simili: nessun corpo è un esito, non un errore
  }
  if (!response.ok) {
    const problem = body as { detail?: string; title?: string } | null;
    throw new ApiError(
      problem?.detail ?? problem?.title ?? `HTTP ${String(response.status)}`,
      response.status,
    );
  }
  return body as T;
}
